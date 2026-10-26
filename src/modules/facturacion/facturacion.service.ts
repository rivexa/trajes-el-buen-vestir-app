import { Injectable, InternalServerErrorException, NotFoundException, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../../config/supabase.service';
import { CreateFacturaDto } from './dto/factura.dto';
import { SriService } from '../sri/sri.service';
import { FacturaSRIDto } from '../sri/sri.interface';

@Injectable()
export class FacturacionService {
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

        // 1. Obtener datos del cliente
        const { data: cliente, error: errCliente } = await supabase
            .from('clientes')
            .select('*')
            .eq('id', dto.cliente_id)
            .single();

        if (errCliente || !cliente) throw new NotFoundException('Cliente no encontrado.');

        let ordenAnterior = null;
        if (dto.orden_id) {
            const { data: orden, error: errOrden } = await supabase
                .from('ordenes_pedido')
                .select('abono, saldo, estado, factura_id, subtotal')
                .eq('id', dto.orden_id)
                .single();

            if (errOrden || !orden) throw new NotFoundException('Orden de pedido no encontrada.');
            if (orden.estado === 'Anulada') throw new BadRequestException('No se puede facturar una orden anulada.');
            if (orden.factura_id) throw new BadRequestException('Esta orden ya tiene una factura emitida.');

            ordenAnterior = orden;
        }

        // 3. Calcular valores
        const subtotal = dto.detalles.reduce((acc, item) => acc + (item.cantidad * item.precio_unitario), 0);
        const iva = 0;
        const total = subtotal;

        // 4. Crear cabecera en BD
        const { data: factura, error: errFactura } = await supabase
            .from('facturas')
            .insert([{
                cliente_id: dto.cliente_id,
                orden_id: dto.orden_id || null,
                subtotal_factura: subtotal,
                iva_aplicado: iva,
                total_factura: total,
                metodo_pago: dto.metodo_pago || 'Efectivo',
                estado_sri: 'PROCESANDO'
            }])
            .select()
            .single();

        if (errFactura) throw new InternalServerErrorException(`Error al guardar factura: ${errFactura.message}`);

        try {
            const detallesInsert = dto.detalles.map((d: any) => ({
                factura_id: factura.id,
                descripcion: d.descripcion,
                cantidad: d.cantidad,
                precio_unitario: d.precio_unitario
            }));
            const { error: errDetalles } = await supabase.from('factura_detalles').insert(detallesInsert);
            if (errDetalles) throw new Error(errDetalles.message);

            // 6. Vincular la orden y hacer rollback data
            if (dto.orden_id && ordenAnterior) {
                const { error: errUpdateOrden } = await supabase.from('ordenes_pedido').update({
                    factura_id: factura.id,
                    abono_antes_facturar: ordenAnterior.abono,
                    saldo_antes_facturar: ordenAnterior.saldo,
                    abono: subtotal
                }).eq('id', dto.orden_id);

                if (errUpdateOrden) throw new Error(errUpdateOrden.message);
            }
        } catch (dbError: any) {
            await supabase.from('facturas').update({
                estado_sri: 'ERROR_CONEXION',
                mensaje_sri: `Fallo interno BD: ${dbError.message}`
            }).eq('id', factura.id);
            throw new InternalServerErrorException(`Fallo al procesar detalles o vinculación: ${dbError.message}`);
        }

        // 7. Preparar datos SRI
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
            items: dto.detalles.map((detalle: any, index: number) => ({
                codigoPrincipal: `P-${(index + 1).toString().padStart(3, '0')}`,
                descripcion: detalle.descripcion,
                cantidad: detalle.cantidad,
                precioUnitario: detalle.precio_unitario,
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

        return data;
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
                await supabase.from('ordenes_pedido').update({
                    factura_id: null,
                    abono: ord.abono_antes_facturar,
                    abono_antes_facturar: null,
                    saldo_antes_facturar: null
                }).eq('id', ord.id);
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
}