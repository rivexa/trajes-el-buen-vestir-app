import {
    Injectable,
    InternalServerErrorException,
    NotFoundException,
    BadRequestException,
    ConflictException,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import { SupabaseService } from '../../config/supabase.service';
import { CreateFacturaDto, FacturaDetalleDto } from './dto/factura.dto';
import { acotarPaginacionFacturas, sanitizarBusquedaFactura } from './facturacion.consulta';
import { redondearDinero, subtotalDetalles } from './facturacion.dinero';
import { SriService } from '../sri/sri.service';
import { FacturaSRIDto, ResultadoSri } from '../sri/sri.interface';
import { esXmlComprobanteFactura } from '../sri/sri.respuesta';
import { parsearRideDesdeXml } from './ride/ride.parser';
import { generarRidePdf } from './ride/ride.pdf';

/** Reconsulta periódica de facturas en PROCESANDO. */
const INTERVALO_CONSULTA_PROCESANDO_MS = 60_000;

@Injectable()
export class FacturacionService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(FacturacionService.name);
    private timerProcesando?: NodeJS.Timeout;
    private consultandoProcesando = false;

    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly sriService: SriService
    ) { }

    onModuleInit() {
        this.timerProcesando = setInterval(() => {
            void this.resolverFacturasProcesando();
        }, INTERVALO_CONSULTA_PROCESANDO_MS);
    }

    onModuleDestroy() {
        if (this.timerProcesando) clearInterval(this.timerProcesando);
    }

    async obtenerTodas(page?: number, limit?: number, search = '') {
        const { page: pagina, limit: tamano } = acotarPaginacionFacturas(page, limit);
        const termino = sanitizarBusquedaFactura(search);
        const from = (pagina - 1) * tamano;
        const to = from + tamano - 1;
        const supabase = this.supabaseService.getClient();

        let query = supabase
            .from('facturas')
            .select('*, clientes!inner(nombres, apellidos, cedula_ruc), ordenes_pedido!facturas_orden_id_fkey(numero_orden)', { count: 'exact' });

        if (termino) {
            query = query.or(`clientes.cedula_ruc.ilike.%${termino}%,clientes.nombres.ilike.%${termino}%,clientes.apellidos.ilike.%${termino}%`);
        }

        const { data, count, error } = await query.order('fecha_emision', { ascending: false }).range(from, to);

        if (error) this.falloPersistencia(error, 'No se pudo listar las facturas.');

        return {
            data,
            meta: {
                total: count,
                page: pagina,
                limit: tamano,
                totalPages: Math.ceil((count || 0) / tamano),
            },
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
                direccion: cliente.direccion || 'Quito, Ecuador',
                email: cliente.correo || undefined,
            },
            subtotal,
            metodoPago: dto.metodo_pago || 'Efectivo',
            items: lineas.map((detalle, index) => ({
                codigoPrincipal: `P-${(index + 1).toString().padStart(3, '0')}`,
                descripcion: detalle.descripcion,
                cantidad: detalle.cantidad,
                precioUnitario: redondearDinero(detalle.precio_unitario),
                descuento: 0,
            })),
        };

        let resultadoSri;
        try {
            resultadoSri = await this.sriService.procesarFacturaElectronica(sriDto);
        } catch (sriError: any) {
            await this.marcarErrorConexion(
                factura.id,
                sriError.message || 'Error desconocido al firmar o transmitir.',
            );
            return { ...factura, sri: { exito: false, mensaje: 'Registrada localmente, falló conexión con SRI.' } };
        }

        try {
            await this.persistirResultadoSri(factura.id, secuencialFormateado, resultadoSri);
        } catch (persistError: any) {
            this.logger.error(
                `SRI respondió (${resultadoSri.estado}) pero no se pudo persistir factura ${factura.id}: ${persistError?.message || persistError}`,
            );
            return {
                ...factura,
                sri: {
                    ...resultadoSri,
                    mensaje: resultadoSri.mensaje
                        || 'El SRI respondió, pero no se pudo guardar el resultado en la base.',
                },
            };
        }

        return { ...factura, sri: resultadoSri };
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

        if (error && error.code !== 'PGRST116') {
            this.falloPersistencia(error, 'No se pudo consultar la factura.');
        }
        if (error || !data) {
            throw new NotFoundException('Factura no encontrada.');
        }

        const { data: ordenes } = await supabase
            .from('ordenes_pedido')
            .select('id, numero_orden, subtotal, abono, saldo, estado')
            .eq('factura_id', id);

        return { ...data, ordenes: ordenes ?? [] };
    }

    async generarRide(id: string): Promise<{ buffer: Buffer; filename: string }> {
        const supabase = this.supabaseService.getClient();
        const { data: factura, error } = await supabase
            .from('facturas')
            .select('id, estado_sri, xml_url, clave_acceso_sri, numero_factura_sri, secuencial_local')
            .eq('id', id)
            .single();

        if (error && error.code !== 'PGRST116') {
            this.falloPersistencia(error, 'No se pudo consultar la factura.');
        }
        if (error || !factura) {
            throw new NotFoundException('Factura no encontrada.');
        }
        if (factura.estado_sri !== 'AUTORIZADO') {
            throw new ConflictException('El RIDE solo se genera para comprobantes autorizados por el SRI.');
        }
        if (!esXmlComprobanteFactura(factura.xml_url)) {
            throw new BadRequestException('La factura autorizada no tiene un XML de comprobante guardado.');
        }

        try {
            const ride = await parsearRideDesdeXml(factura.xml_url);
            if (!ride.claveAcceso && factura.clave_acceso_sri) {
                ride.claveAcceso = factura.clave_acceso_sri;
            }
            const buffer = await generarRidePdf(ride);
            const secuencial = ride.secuencial
                || factura.numero_factura_sri
                || String(factura.secuencial_local || '1').padStart(9, '0');
            return {
                buffer,
                filename: `RIDE-${ride.estab || '001'}-${ride.ptoEmi || '001'}-${secuencial}.pdf`,
            };
        } catch (error: any) {
            this.logger.error(`No se pudo generar el RIDE de ${id}: ${error.message}`);
            throw new InternalServerErrorException('No se pudo generar el RIDE a partir del XML autorizado.');
        }
    }

    async anularFactura(id: string) {
        const supabase = this.supabaseService.getClient();

        const { data: factura, error: errorBusqueda } = await supabase
            .from('facturas')
            .select('id, estado_sri')
            .eq('id', id)
            .single();

        if (errorBusqueda && errorBusqueda.code !== 'PGRST116') {
            this.falloPersistencia(errorBusqueda, 'No se pudo consultar la factura.');
        }
        if (errorBusqueda || !factura) {
            throw new NotFoundException('Factura no encontrada.');
        }
        if (factura.estado_sri === 'AUTORIZADO') {
            throw new ConflictException('No se puede anular un comprobante autorizado por el SRI.');
        }
        if (factura.estado_sri === 'ANULADA') {
            throw new ConflictException('Esta factura ya se encuentra anulada.');
        }

        const { error } = await supabase.from('facturas').update({ estado_sri: 'ANULADA' }).eq('id', id);
        if (error) this.falloPersistencia(error, 'No se pudo anular la factura.');

        const { data: ordenesAfectadas, error: errorOrdenes } = await supabase
            .from('ordenes_pedido')
            .select('id, abono_antes_facturar')
            .eq('factura_id', id);

        if (errorOrdenes) this.falloPersistencia(errorOrdenes, 'No se pudieron restaurar las órdenes de la factura.');

        for (const ord of ordenesAfectadas ?? []) {
            const restauracion: {
                factura_id: null;
                abono?: number;
                abono_antes_facturar: null;
                saldo_antes_facturar: null;
            } = {
                factura_id: null,
                abono_antes_facturar: null,
                saldo_antes_facturar: null,
            };
            if (ord.abono_antes_facturar != null) {
                restauracion.abono = Number(ord.abono_antes_facturar);
            }
            const { error: errorRestaurar } = await supabase
                .from('ordenes_pedido')
                .update(restauracion)
                .eq('id', ord.id);

            if (errorRestaurar) {
                this.falloPersistencia(errorRestaurar, 'No se pudo devolver la orden a su saldo anterior.');
            }
        }

        return { mensaje: 'Factura anulada. Las órdenes asociadas recuperaron su saldo pendiente.' };
    }

    async reintentarSri(id: string) {
        const supabase = this.supabaseService.getClient();
        const factura = await this.obtenerPorId(id);

        if (factura.estado_sri === 'AUTORIZADO') {
            throw new BadRequestException('La factura ya está autorizada, no se puede reintentar.');
        }

        const secuencialFormateado = (factura.secuencial_local || 1).toString().padStart(9, '0');
        const xmlGuardado = typeof factura.xml_url === 'string' ? factura.xml_url : undefined;
        const claveGuardada = typeof factura.clave_acceso_sri === 'string' ? factura.clave_acceso_sri.trim() : '';
        const xmlFirmado = esXmlComprobanteFactura(xmlGuardado) ? xmlGuardado : undefined;

        // Ya en PROCESANDO con clave: solo consultar autorización (no retransmitir).
        if (claveGuardada && factura.estado_sri === 'PROCESANDO') {
            try {
                const resultadoSri = await this.sriService.consultarAutorizacion({
                    claveAcceso: claveGuardada,
                    xmlFirmado,
                });
                await this.persistirResultadoSri(factura.id, secuencialFormateado, resultadoSri);
                return { mensaje: 'Consulta de autorización finalizada', sri: resultadoSri };
            } catch (sriError: any) {
                await supabase.from('facturas').update({
                    estado_sri: 'ERROR_CONEXION',
                    mensaje_sri: sriError.message || 'Fallo de conexión.',
                }).eq('id', factura.id);
                return { mensaje: 'El SRI sigue sin responder.', sri: { exito: false } };
            }
        }

        const identificacion = factura.clientes.cedula_ruc;
        const tipoIdentificacion = identificacion.length === 13 ? '04' : (identificacion.length === 10 ? '05' : '06');

        const sriDto: FacturaSRIDto = {
            secuencial: secuencialFormateado,
            cliente: {
                tipoIdentificacion,
                razonSocial: `${factura.clientes.nombres} ${factura.clientes.apellidos}`.trim(),
                identificacion,
                direccion: factura.clientes.direccion || 'Quito, Ecuador',
                email: factura.clientes.correo || undefined,
            },
            subtotal: factura.subtotal_factura,
            metodoPago: factura.metodo_pago || 'Efectivo',
            claveAcceso: claveGuardada || undefined,
            xmlFirmado,
            items: factura.factura_detalles.map((detalle: { descripcion: string; cantidad: number; precio_unitario: number }, index: number) => ({
                codigoPrincipal: `P-${(index + 1).toString().padStart(3, '0')}`,
                descripcion: detalle.descripcion,
                cantidad: detalle.cantidad,
                precioUnitario: detalle.precio_unitario,
                descuento: 0,
            })),
        };

        try {
            const resultadoSri = await this.sriService.procesarFacturaElectronica(sriDto);
            await this.persistirResultadoSri(factura.id, secuencialFormateado, resultadoSri);
            return { mensaje: 'Reintento finalizado', sri: resultadoSri };
        } catch (sriError: any) {
            await supabase.from('facturas').update({
                estado_sri: 'ERROR_CONEXION',
                mensaje_sri: sriError.message || 'Fallo de conexión.',
            }).eq('id', factura.id);
            return { mensaje: 'El SRI sigue sin responder.', sri: { exito: false } };
        }
    }

    /** Job: vuelve a consultar al SRI las facturas atascadas en PROCESANDO. */
    async resolverFacturasProcesando() {
        if (this.consultandoProcesando) return { revisadas: 0, actualizadas: 0 };
        this.consultandoProcesando = true;

        try {
            const supabase = this.supabaseService.getClient();
            const { data, error } = await supabase
                .from('facturas')
                .select('id, secuencial_local, clave_acceso_sri, xml_url, estado_sri')
                .eq('estado_sri', 'PROCESANDO')
                .not('clave_acceso_sri', 'is', null)
                .limit(20);

            if (error) {
                this.logger.warn(`No se pudieron listar facturas PROCESANDO: ${error.message}`);
                return { revisadas: 0, actualizadas: 0 };
            }

            const pendientes = (data ?? []).filter((f) => String(f.clave_acceso_sri || '').trim());
            let actualizadas = 0;

            for (const factura of pendientes) {
                try {
                    const secuencialFormateado = (factura.secuencial_local || 1).toString().padStart(9, '0');
                    const xmlGuardado = typeof factura.xml_url === 'string' ? factura.xml_url : undefined;
                    const resultado = await this.sriService.consultarAutorizacion({
                        claveAcceso: String(factura.clave_acceso_sri),
                        xmlFirmado: esXmlComprobanteFactura(xmlGuardado) ? xmlGuardado : undefined,
                    });

                    if (resultado.estado === 'PENDIENTE') continue;

                    await this.persistirResultadoSri(factura.id, secuencialFormateado, resultado);
                    actualizadas += 1;
                } catch (err: any) {
                    this.logger.warn(`Consulta SRI falló para factura ${factura.id}: ${err?.message || err}`);
                }
            }

            if (pendientes.length > 0) {
                this.logger.log(`SRI pendientes: revisadas=${pendientes.length} actualizadas=${actualizadas}`);
            }

            return { revisadas: pendientes.length, actualizadas };
        } finally {
            this.consultandoProcesando = false;
        }
    }

    private async persistirResultadoSri(
        facturaId: string,
        secuencialFormateado: string,
        resultado: ResultadoSri,
    ) {
        const estadoLocal =
            resultado.estado === 'AUTORIZADO' ? 'AUTORIZADO'
                : resultado.estado === 'PENDIENTE' ? 'PROCESANDO'
                    : resultado.estado === 'ERROR_CONEXION' ? 'ERROR_CONEXION'
                        : 'RECHAZADO';

        const { error } = await this.supabaseService.getClient().from('facturas').update({
            estado_sri: estadoLocal,
            numero_factura_sri: secuencialFormateado,
            clave_acceso_sri: resultado.claveAcceso,
            // Autorizado: comprobante. Si no: XML firmado para reutilizar clave/firma.
            xml_url: resultado.xmlAutorizado ?? resultado.xmlFirmado,
            mensaje_sri: resultado.mensaje
                ?? (resultado.exito ? 'Autorizado' : 'Rechazado por validaciones del SRI.'),
        }).eq('id', facturaId);

        if (error) this.falloPersistencia(error, 'No se pudo guardar el resultado del SRI.');
    }

    private async marcarErrorConexion(facturaId: string, mensaje: string) {
        const { error } = await this.supabaseService.getClient().from('facturas').update({
            estado_sri: 'ERROR_CONEXION',
            mensaje_sri: mensaje,
        }).eq('id', facturaId);

        if (error) {
            // Si aún no existe mensaje_sri, al menos deja el estado.
            this.logger.error(`No se pudo marcar ERROR_CONEXION [${error.code}] ${error.message}`);
            await this.supabaseService.getClient().from('facturas').update({
                estado_sri: 'ERROR_CONEXION',
            }).eq('id', facturaId);
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

    private falloPersistencia(error: { code?: string; message?: string }, mensaje: string): never {
        this.logger.error(`${mensaje} [${error.code ?? 'sin-codigo'}] ${error.message ?? ''}`);
        throw new InternalServerErrorException(mensaje);
    }
}