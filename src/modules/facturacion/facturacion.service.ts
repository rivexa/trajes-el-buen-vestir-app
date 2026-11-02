import { Injectable, InternalServerErrorException, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { SupabaseService } from '../../config/supabase.service';
import { CreateFacturaDto, FacturaDetalleDto } from './dto/factura.dto';
import { redondearDinero, subtotalDetalles } from './facturacion.dinero';
import { SriService } from '../sri/sri.service';
import { FacturaSRIDto } from '../sri/sri.interface';

@Injectable()
export class FacturacionService {
    private readonly logger = new Logger(FacturacionService.name);

    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly sriService: SriService
    ) { }

    async obtenerTodas(page: number = 1, limit: number = 10, search?: string) {
        const supabase = this.supabaseService.getClient();
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        let query = supabase
            .from('facturas')
            .select('*, clientes!inner(nombres, apellidos, cedula_ruc), ordenes_pedido!facturas_orden_id_fkey(numero_orden)', { count: 'exact' });

        if (search) {
            query = query.or(`clientes.cedula_ruc.ilike.%${search}%,clientes.nombres.ilike.%${search}%,clientes.apellidos.ilike.%${search}%`);
        }

        const { data, count, error } = await query.order('fecha_emision', { ascending: false }).range(from, to);

        if (error) {
            console.error("Error exacto de Supabase:", error);
            throw new InternalServerErrorException(`Error de BD al consultar facturas: ${error.message}`);
        }

        return {
            data,
            meta: { total: count, page, limit, totalPages: Math.ceil((count || 0) / limit) }
        };
    }

    async emitirFactura(dto: CreateFacturaDto) {
        const supabase = this.supabaseService.getClient();

        const { data: cliente, error: errCliente } = await supabase
            .from('clientes')
            .select('*')
            .eq('id', dto.cliente_id)
            .single();

        if (errCliente || !cliente) throw new NotFoundException('Cliente no encontrado.');

        const { lineas, ordenes } = await this.resolverOrdenes(dto);
        const subtotal = subtotalDetalles(lineas);
        const iva = 0;
        const total = subtotal;

        const { data: factura, error: errFactura } = await supabase
            .from('facturas')
            .insert([{
                cliente_id: dto.cliente_id,
                orden_id: ordenes[0]?.id ?? null,
                subtotal_factura: subtotal,
                iva_aplicado: iva,
                total_factura: total,
                metodo_pago: dto.metodo_pago || 'Efectivo',
                estado_sri: 'PROCESANDO'
            }])
            .select()
            .single();

        if (errFactura) throw new InternalServerErrorException('No se pudo registrar la factura.');

        const detallesInsert = lineas.map((d) => ({
            factura_id: factura.id,
            descripcion: d.descripcion,
            cantidad: d.cantidad,
            precio_unitario: redondearDinero(d.precio_unitario),
        }));
        const { error: errDetalles } = await supabase.from('factura_detalles').insert(detallesInsert);
        if (errDetalles) {
            await this.revertirCabecera(factura.id);
            throw new InternalServerErrorException('No se pudieron registrar los detalles de la factura.');
        }

        const vinculadas: string[] = [];
        try {
            for (const orden of ordenes) {
                const { data: ordenVinculada, error: errUpdateOrden } = await supabase
                    .from('ordenes_pedido')
                    .update({
                        factura_id: factura.id,
                        abono_antes_facturar: orden.abono,
                        saldo_antes_facturar: orden.saldo,
                        abono: orden.subtotal,
                    })
                    .eq('id', orden.id)
                    .is('factura_id', null)
                    .select('id')
                    .single();

                if (errUpdateOrden || !ordenVinculada) {
                    if (errUpdateOrden && errUpdateOrden.code !== 'PGRST116') {
                        throw new InternalServerErrorException('No se pudo vincular la factura a la orden.');
                    }
                    throw new ConflictException('Una de las órdenes ya tiene una factura emitida.');
                }
                vinculadas.push(orden.id);
            }
        } catch (error) {
            await this.desvincularOrdenes(vinculadas, ordenes);
            await this.revertirCabecera(factura.id);
            throw error;
        }

        const identificacion = cliente.cedula_ruc;
        const tipoIdentificacion = identificacion.length === 13 ? '04' : (identificacion.length === 10 ? '05' : '06');
        const secuencialFormateado = (factura.secuencial_local || 1).toString().padStart(9, '0');

        const sriDto: FacturaSRIDto = {
            secuencial: secuencialFormateado,
            cliente: {
                tipoIdentificacion,
                razonSocial: `${cliente.nombres} ${cliente.apellidos}`.trim(),
                identificacion: identificacion,
                direccion: cliente.direccion || 'Quito, Ecuador'
            },
            subtotal: subtotal,
            items: lineas.map((detalle, index) => ({
                codigoPrincipal: `P-${(index + 1).toString().padStart(3, '0')}`,
                descripcion: detalle.descripcion,
                cantidad: detalle.cantidad,
                precioUnitario: redondearDinero(detalle.precio_unitario),
                descuento: 0
            }))
        };

        // 8. Enviar al SRI
        try {
            const resultadoSri = await this.sriService.procesarFacturaElectronica(sriDto);

            await supabase.from('facturas').update({
                estado_sri: resultadoSri.exito ? 'AUTORIZADO' : 'RECHAZADO',
                numero_factura_sri: secuencialFormateado,
                clave_acceso_sri: resultadoSri.claveAcceso,
                xml_url: resultadoSri.xmlAutorizado,
                mensaje_sri: resultadoSri.exito ? 'Autorizado' : 'Rechazado por validaciones del SRI.'
            }).eq('id', factura.id);

            return { ...factura, sri: resultadoSri };
        } catch (sriError: any) {
            await supabase.from('facturas').update({
                estado_sri: 'ERROR_CONEXION',
                mensaje_sri: sriError.message || 'Error desconocido al firmar o transmitir.'
            }).eq('id', factura.id);
            return { ...factura, sri: { exito: false, mensaje: 'Registrada localmente, falló conexión con SRI.' } };
        }
    }

    async obtenerPorId(id: string) {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase
            .from('facturas')
            .select(`
                *,
                clientes (*),
                ordenes_pedido!facturas_orden_id_fkey (*),
                factura_detalles (*)
            `)
            .eq('id', id)
            .single();

        if (error) {
            console.error("Error exacto de Supabase en obtenerPorId:", error);
            throw new InternalServerErrorException(`Error de BD al consultar la factura: ${error.message}`);
        }

        if (!data) {
            throw new NotFoundException('Factura no encontrada.');
        }

        const { data: ordenes } = await supabase
            .from('ordenes_pedido')
            .select('id, numero_orden, subtotal, abono, saldo, estado')
            .eq('factura_id', id);

        return { ...data, ordenes: ordenes ?? [] };
    }

    async anularFactura(id: string) {
        const supabase = this.supabaseService.getClient();

        // 1. Marcar la factura como ANULADA
        const { error } = await supabase.from('facturas').update({ estado_sri: 'ANULADA' }).eq('id', id);
        if (error) throw new InternalServerErrorException('Error al anular la factura.');

        // 2. Ejecutar Rollback 
        const { data: ordenesAfectadas } = await supabase
            .from('ordenes_pedido')
            .select('id, abono_antes_facturar, saldo_antes_facturar')
            .eq('factura_id', id);

        if (ordenesAfectadas && ordenesAfectadas.length > 0) {
            for (const ord of ordenesAfectadas) {
                const restauracion: {
                    factura_id: null;
                    abono?: number | null;
                    abono_antes_facturar?: null;
                    saldo_antes_facturar?: null;
                } = { factura_id: null };
                if (ord.abono_antes_facturar != null) {
                    restauracion.abono = ord.abono_antes_facturar;
                    restauracion.abono_antes_facturar = null;
                    restauracion.saldo_antes_facturar = null;
                }
                await supabase.from('ordenes_pedido').update(restauracion).eq('id', ord.id);
            }
        }

        return { mensaje: 'Factura anulada y rollback de órdenes ejecutado con éxito.' };
    }

    async reintentarSri(id: string) {
        const supabase = this.supabaseService.getClient();
        const factura = await this.obtenerPorId(id);

        if (factura.estado_sri === 'AUTORIZADO') {
            throw new BadRequestException('La factura ya está autorizada, no se puede reintentar.');
        }

        const identificacion = factura.clientes.cedula_ruc;
        const tipoIdentificacion = identificacion.length === 13 ? '04' : (identificacion.length === 10 ? '05' : '06');
        const secuencialFormateado = (factura.secuencial_local || 1).toString().padStart(9, '0');

        const sriDto: FacturaSRIDto = {
            secuencial: secuencialFormateado,
            cliente: {
                tipoIdentificacion,
                razonSocial: `${factura.clientes.nombres} ${factura.clientes.apellidos}`.trim(),
                identificacion: identificacion,
                direccion: factura.clientes.direccion || 'Quito, Ecuador'
            },
            subtotal: factura.subtotal_factura,
            items: factura.factura_detalles.map((detalle: any, index: number) => ({
                codigoPrincipal: `P-${(index + 1).toString().padStart(3, '0')}`,
                descripcion: detalle.descripcion,
                cantidad: detalle.cantidad,
                precioUnitario: detalle.precio_unitario,
                descuento: 0
            }))
        };

        try {
            const resultadoSri = await this.sriService.procesarFacturaElectronica(sriDto);

            await supabase.from('facturas').update({
                estado_sri: resultadoSri.exito ? 'AUTORIZADO' : 'RECHAZADO',
                numero_factura_sri: secuencialFormateado,
                clave_acceso_sri: resultadoSri.claveAcceso,
                xml_url: resultadoSri.xmlAutorizado,
                mensaje_sri: resultadoSri.exito ? 'Autorizado' : 'Rechazado por validaciones del SRI.'
            }).eq('id', factura.id);

            return { mensaje: 'Reintento finalizado', sri: resultadoSri };
        } catch (sriError: any) {
            await supabase.from('facturas').update({
                estado_sri: 'ERROR_CONEXION',
                mensaje_sri: sriError.message || 'Fallo de conexión.'
            }).eq('id', factura.id);
            return { mensaje: 'El SRI sigue sin responder.', sri: { exito: false } };
        }
    }

    private idsOrdenes(dto: CreateFacturaDto): string[] {
        const ids = [...(dto.orden_ids ?? [])];
        if (dto.orden_id && !ids.includes(dto.orden_id)) {
            ids.unshift(dto.orden_id);
        }
        return [...new Set(ids)];
    }

    private async resolverOrdenes(dto: CreateFacturaDto): Promise<{
        lineas: FacturaDetalleDto[];
        ordenes: Array<{ id: string; subtotal: number; abono: number; saldo: number }>;
    }> {
        const ids = this.idsOrdenes(dto);
        if (ids.length === 0) {
            return { lineas: dto.detalles ?? [], ordenes: [] };
        }

        const { data, error } = await this.supabaseService.getClient()
            .from('ordenes_pedido')
            .select('id, cliente_id, estado, factura_id, abono, saldo, subtotal, orden_detalles(descripcion, cantidad, precio_unitario)')
            .in('id', ids);

        if (error) {
            throw new InternalServerErrorException('No se pudieron consultar las órdenes.');
        }

        const encontradas = data ?? [];
        const lineas: FacturaDetalleDto[] = [];
        const ordenes: Array<{ id: string; subtotal: number; abono: number; saldo: number }> = [];

        for (const id of ids) {
            const orden = encontradas.find((item) => item.id === id);
            if (!orden) {
                throw new NotFoundException('Una de las órdenes de pedido no existe.');
            }
            if (orden.estado === 'Anulada') {
                throw new BadRequestException('No se puede facturar una orden anulada.');
            }
            if (orden.factura_id) {
                throw new ConflictException('Una de las órdenes ya tiene una factura emitida.');
            }
            if (orden.cliente_id !== dto.cliente_id) {
                throw new BadRequestException('Una de las órdenes no pertenece al cliente indicado.');
            }

            const lineasOrden = (orden.orden_detalles ?? []).map((item: {
                descripcion: string;
                cantidad: number;
                precio_unitario: number;
            }) => ({
                descripcion: item.descripcion,
                cantidad: Number(item.cantidad),
                precio_unitario: redondearDinero(Number(item.precio_unitario)),
            }));

            if (lineasOrden.length === 0) {
                throw new BadRequestException('Una de las órdenes no tiene detalles para facturar.');
            }

            lineas.push(...lineasOrden);
            ordenes.push({
                id: orden.id,
                subtotal: redondearDinero(Number(orden.subtotal)),
                abono: redondearDinero(Number(orden.abono)),
                saldo: redondearDinero(Number(orden.saldo)),
            });
        }

        if (lineas.length > 50) {
            throw new BadRequestException('La factura no puede tener más de 50 ítems.');
        }

        return { lineas, ordenes };
    }

    private async desvincularOrdenes(
        vinculadas: string[],
        ordenes: Array<{ id: string; abono: number }>,
    ) {
        const supabase = this.supabaseService.getClient();
        for (const id of vinculadas) {
            const original = ordenes.find((orden) => orden.id === id);
            const { error } = await supabase.from('ordenes_pedido').update({
                factura_id: null,
                abono: original?.abono,
                abono_antes_facturar: null,
                saldo_antes_facturar: null,
            }).eq('id', id);
            if (error) {
                this.logger.error(`No se pudo desvincular la orden ${id} [${error.code}] ${error.message}`);
            }
        }
    }

    private async revertirCabecera(facturaId: string) {
        const { error } = await this.supabaseService.getClient()
            .from('facturas')
            .delete()
            .eq('id', facturaId);
        if (error) {
            this.logger.error(`No se pudo revertir la cabecera ${facturaId} [${error.code}] ${error.message}`);
        }
    }
}