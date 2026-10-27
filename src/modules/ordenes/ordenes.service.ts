import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../config/supabase.service';
import { CreateOrdenDto, esEstadoProduccion } from './dto/orden.dto';
import { acotarPaginacionOrdenes, sanitizarBusquedaOrden } from './ordenes.consulta';
import { redondearDinero, subtotalDetalles } from './ordenes.dinero';

@Injectable()
export class OrdenesService {
    private readonly logger = new Logger(OrdenesService.name);

    constructor(private readonly supabaseService: SupabaseService) { }

    async obtenerTodos(page?: number, limit?: number, search = '') {
        const { page: pagina, limit: tamano } = acotarPaginacionOrdenes(page, limit);
        const termino = sanitizarBusquedaOrden(search);
        const from = (pagina - 1) * tamano;
        const to = from + tamano - 1;
        const supabase = this.supabaseService.getClient();

        let query = supabase
            .from('ordenes_pedido')
            .select('*, clientes!inner(nombres, apellidos, cedula_ruc)', { count: 'exact' });

        if (termino) {
            const numeroOrden = termino.replace(/^ord-?/i, '');
            const isNumeric = /^\d+$/.test(numeroOrden);

            if (isNumeric) {
                if (numeroOrden.length >= 10) {
                    query = query.eq('clientes.cedula_ruc', numeroOrden);
                } else {
                    query = query.eq('numero_orden', parseInt(numeroOrden, 10));
                }
            } else {
                query = query.or(
                    `nombres.ilike.%${termino}%,apellidos.ilike.%${termino}%`,
                    { foreignTable: 'clientes' },
                );
            }
        }

        const { data, count, error } = await query
            .order('fecha_creacion', { ascending: false })
            .range(from, to);

        if (error) this.falloPersistencia(error, 'No se pudo listar las órdenes.');

        return {
            data,
            meta: {
                total: count,
                page: pagina,
                limit: tamano,
                totalPages: Math.ceil((count || 0) / tamano)
            }
        };
    }

    async crearOrden(ordenData: CreateOrdenDto) {
        const supabase = this.supabaseService.getClient();
        const { cliente_id, fecha_entrega_estimada, abono = 0, detalles } = ordenData;
        const subtotalCalculado = subtotalDetalles(detalles);
        const abonoInicial = redondearDinero(abono);

        const { data: orden, error: ordenError } = await supabase
            .from('ordenes_pedido')
            .insert([{
                cliente_id,
                fecha_entrega_estimada,
                subtotal: subtotalCalculado,
                abono: abonoInicial,
                estado: 'Pendiente'
            }])
            .select()
            .single();

        if (ordenError) {
            if (ordenError.code === '23503') {
                throw new NotFoundException('No se encontró el cliente indicado.');
            }
            this.falloPersistencia(ordenError, 'No se pudo registrar la orden.');
        }

        const detallesParaInsertar = detalles.map((item) => ({
            orden_id: orden.id,
            tipo_item: item.tipo_item,
            descripcion: item.descripcion,
            cantidad: item.cantidad,
            precio_unitario: redondearDinero(item.precio_unitario),
            imagen_referencia_url: item.imagen_referencia_url,
        }));

        const { error: detallesError } = await supabase
            .from('orden_detalles')
            .insert(detallesParaInsertar);

        if (detallesError) {
            const { error: rollbackError } = await supabase.from('ordenes_pedido').delete().eq('id', orden.id);
            if (rollbackError) {
                this.logger.error(`No se pudo revertir la cabecera ${orden.id} [${rollbackError.code}] ${rollbackError.message}`);
            }
            this.falloPersistencia(detallesError, 'No se pudieron registrar los detalles de la orden.');
        }

        return orden;
    }

    async obtenerOrden(id: string) {
        const supabase = this.supabaseService.getClient();

        const { data, error } = await supabase
            .from('ordenes_pedido')
            .select(`
                *,
                clientes (nombres, apellidos, cedula_ruc, telefono),
                orden_detalles (*)
            `)
            .eq('id', id)
            .single();

        if (error && error.code !== 'PGRST116') {
            this.falloPersistencia(error, 'No se pudo consultar la orden.');
        }
        if (error || !data) {
            throw new NotFoundException('Orden no encontrada.');
        }

        return data;
    }

    async actualizarOrden(id: string, ordenData: CreateOrdenDto) {
        const supabase = this.supabaseService.getClient();
        const { fecha_entrega_estimada, abono = 0, detalles } = ordenData;
        const subtotalCalculado = subtotalDetalles(detalles);

        const { data: cabecera, error: cabeceraError } = await supabase
            .from('ordenes_pedido')
            .update({
                fecha_entrega_estimada,
                abono: redondearDinero(abono),
                subtotal: subtotalCalculado
            })
            .eq('id', id)
            .select('id')
            .single();

        if (cabeceraError) {
            if (cabeceraError.code === 'PGRST116') {
                throw new NotFoundException('Orden no encontrada.');
            }
            this.falloPersistencia(cabeceraError, 'No se pudo actualizar la orden.');
        }
        if (!cabecera) {
            throw new NotFoundException('Orden no encontrada.');
        }

        await supabase.from('orden_detalles').delete().eq('orden_id', id);

        const detallesParaInsertar = detalles.map((item) => ({
            orden_id: id,
            tipo_item: item.tipo_item,
            descripcion: item.descripcion,
            cantidad: item.cantidad,
            precio_unitario: redondearDinero(item.precio_unitario),
            imagen_referencia_url: item.imagen_referencia_url,
        }));

        const { error: detallesError } = await supabase.from('orden_detalles').insert(detallesParaInsertar);

        if (detallesError) this.falloPersistencia(detallesError, 'No se pudieron actualizar los detalles de la orden.');

        return { mensaje: 'Orden actualizada exitosamente' };
    }

    async eliminarOrden(id: string) {
        const supabase = this.supabaseService.getClient();

        const { data: orden, error: errorBusqueda } = await supabase
            .from('ordenes_pedido')
            .select('id, factura_id, estado')
            .eq('id', id)
            .single();

        if (errorBusqueda && errorBusqueda.code !== 'PGRST116') {
            this.falloPersistencia(errorBusqueda, 'No se pudo consultar la orden.');
        }
        if (errorBusqueda || !orden) {
            throw new NotFoundException('Orden no encontrada.');
        }

        if (orden.estado === 'Anulada') {
            throw new ConflictException('Esta orden ya se encuentra anulada.');
        }

        if (orden.factura_id) {
            throw new ConflictException('No se puede anular esta orden porque ya tiene una factura asociada.');
        }

        const { error: errorUpdate } = await supabase
            .from('ordenes_pedido')
            .update({
                estado: 'Anulada',
                abono: 0,
                subtotal: 0
            })
            .eq('id', id);

        if (errorUpdate) this.falloPersistencia(errorUpdate, 'No se pudo anular la orden.');

        return { mensaje: 'Orden anulada exitosamente' };
    }

    async registrarPago(id: string, nuevoPago: number) {
        const supabase = this.supabaseService.getClient();

        const { data: ordenActual, error: errorBusqueda } = await supabase
            .from('ordenes_pedido')
            .select('abono, saldo, subtotal')
            .eq('id', id)
            .single();

        if (errorBusqueda && errorBusqueda.code !== 'PGRST116') {
            this.falloPersistencia(errorBusqueda, 'No se pudo consultar la orden.');
        }
        if (errorBusqueda || !ordenActual) {
            throw new NotFoundException('Orden no encontrada.');
        }

        const pago = redondearDinero(nuevoPago);
        const saldo = redondearDinero(Number(ordenActual.saldo));
        if (pago > saldo) {
            throw new BadRequestException('El pago supera el saldo pendiente.');
        }

        const abonoAcumulado = redondearDinero(Number(ordenActual.abono) + pago);

        const { data: ordenActualizada, error: errorUpdate } = await supabase
            .from('ordenes_pedido')
            .update({ abono: abonoAcumulado })
            .eq('id', id)
            .eq('abono', ordenActual.abono)
            .select()
            .single();

        if (errorUpdate) {
            if (errorUpdate.code === 'PGRST116') {
                throw new ConflictException('El abono de la orden cambió. Vuelva a intentar el pago.');
            }
            this.falloPersistencia(errorUpdate, 'No se pudo registrar el pago.');
        }
        if (!ordenActualizada) {
            throw new ConflictException('El abono de la orden cambió. Vuelva a intentar el pago.');
        }

        return {
            mensaje: 'Pago registrado exitosamente',
            pago_recibido: nuevoPago,
            nuevo_abono_total: ordenActualizada.abono,
            nuevo_saldo_pendiente: ordenActualizada.saldo
        };
    }

    async actualizarEstado(id: string, nuevoEstado: string) {
        if (!esEstadoProduccion(nuevoEstado)) {
            throw new BadRequestException('El estado proporcionado no es válido para el flujo de producción.');
        }

        const supabase = this.supabaseService.getClient();

        const { data: orden, error: errorBusqueda } = await supabase
            .from('ordenes_pedido')
            .select('id, estado')
            .eq('id', id)
            .single();

        if (errorBusqueda && errorBusqueda.code !== 'PGRST116') {
            this.falloPersistencia(errorBusqueda, 'No se pudo consultar la orden.');
        }
        if (errorBusqueda || !orden) {
            throw new NotFoundException('Orden no encontrada.');
        }
        if (orden.estado === 'Anulada') {
            throw new ConflictException('No se puede cambiar el estado de una orden anulada.');
        }

        const { data, error } = await supabase
            .from('ordenes_pedido')
            .update({ estado: nuevoEstado })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                throw new NotFoundException('Orden no encontrada.');
            }
            this.falloPersistencia(error, 'No se pudo actualizar el estado.');
        }
        if (!data) {
            throw new NotFoundException('Orden no encontrada.');
        }

        return { mensaje: 'Estado actualizado correctamente', estado_actual: data.estado };
    }

    private falloPersistencia(error: { code?: string; message?: string }, mensaje: string): never {
        this.logger.error(`${mensaje} [${error.code ?? 'sin-codigo'}] ${error.message ?? ''}`);
        throw new InternalServerErrorException(mensaje);
    }
}
