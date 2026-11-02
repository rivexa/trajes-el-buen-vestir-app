import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../config/supabase.service';
import { CreateOrdenDto } from './dto/orden.dto';
import { redondearDinero, subtotalDetalles } from './ordenes.dinero';

@Injectable()
export class OrdenesService {
    private readonly logger = new Logger(OrdenesService.name);

    constructor(private readonly supabaseService: SupabaseService) { }

    async obtenerTodos(page: number = 1, limit: number = 10, search?: string) {
        const supabase = this.supabaseService.getClient();
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        let query = supabase
            .from('ordenes_pedido')
            .select('*, clientes!inner(nombres, apellidos, cedula_ruc)', { count: 'exact' });

        if (search) {
            const cleanSearch = search.replace(/^ord-?/i, '');
            const isNumeric = /^\d+$/.test(cleanSearch);

            if (isNumeric) {
                if (cleanSearch.length >= 10) {
                    query = query.eq('clientes.cedula_ruc', cleanSearch);
                } else {
                    query = query.eq('numero_orden', parseInt(cleanSearch, 10));
                }
            } else {
                query = query.or(`nombres.ilike.%${cleanSearch}%,apellidos.ilike.%${cleanSearch}%`, { foreignTable: 'clientes' });
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
                page,
                limit,
                totalPages: Math.ceil((count || 0) / limit)
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

        if (abonoInicial > 0) {
            await this.registrarMovimientoPago(orden.id, {
                monto: abonoInicial,
                metodo_pago: 'Efectivo',
                nota: 'Abono inicial al crear la orden',
            }, abonoInicial);
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
                orden_detalles (*),
                orden_pagos (*)
            `)
            .eq('id', id)
            .single();

        if (error && error.code !== 'PGRST116') {
            this.falloPersistencia(error, 'No se pudo consultar la orden.');
        }
        if (error || !data) {
            throw new NotFoundException('Orden no encontrada.');
        }

        const pagos = [...(data.orden_pagos ?? [])].sort((a: { fecha_pago: string }, b: { fecha_pago: string }) =>
            String(b.fecha_pago).localeCompare(String(a.fecha_pago)),
        );

        return { ...data, orden_pagos: pagos };
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

    async registrarPago(
        id: string,
        nuevoPago: number,
        extras: { metodo_pago?: string; nota?: string } = {},
    ) {
        const supabase = this.supabaseService.getClient();

        const { data: ordenActual, error: errorBusqueda } = await supabase
            .from('ordenes_pedido')
            .select('abono, saldo, subtotal, estado')
            .eq('id', id)
            .single();

        if (errorBusqueda && errorBusqueda.code !== 'PGRST116') {
            this.falloPersistencia(errorBusqueda, 'No se pudo consultar la orden.');
        }
        if (errorBusqueda || !ordenActual) {
            throw new NotFoundException('Orden no encontrada.');
        }
        if (ordenActual.estado === 'Anulada') {
            throw new ConflictException('No se puede registrar un pago en una orden anulada.');
        }

        const pago = redondearDinero(nuevoPago);
        const saldo = redondearDinero(Number(ordenActual.saldo));
        if (pago > saldo) {
            throw new BadRequestException('El pago supera el saldo pendiente.');
        }

        const abonoAnterior = Number(ordenActual.abono);
        const abonoAcumulado = redondearDinero(abonoAnterior + pago);

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

        const movimiento = await this.registrarMovimientoPago(id, {
            monto: pago,
            metodo_pago: extras.metodo_pago || 'Efectivo',
            nota: extras.nota,
        }, abonoAnterior);

        return {
            mensaje: 'Pago registrado exitosamente',
            pago_recibido: pago,
            nuevo_abono_total: ordenActualizada.abono,
            nuevo_saldo_pendiente: ordenActualizada.saldo,
            movimiento,
        };
    }

    async obtenerPagosDeOrden(id: string) {
        const supabase = this.supabaseService.getClient();
        const { data: orden, error: errorOrden } = await supabase
            .from('ordenes_pedido')
            .select('id')
            .eq('id', id)
            .single();

        if (errorOrden && errorOrden.code !== 'PGRST116') {
            this.falloPersistencia(errorOrden, 'No se pudo consultar la orden.');
        }
        if (errorOrden || !orden) {
            throw new NotFoundException('Orden no encontrada.');
        }

        const { data, error } = await supabase
            .from('orden_pagos')
            .select('*')
            .eq('orden_id', id)
            .order('fecha_pago', { ascending: false });

        if (error) this.falloPersistencia(error, 'No se pudo listar los pagos de la orden.');
        return { data: data ?? [] };
    }

    async historialPagos(desde?: string, hasta?: string) {
        const supabase = this.supabaseService.getClient();
        let query = supabase
            .from('orden_pagos')
            .select('id, orden_id, monto, metodo_pago, nota, fecha_pago, ordenes_pedido(numero_orden, cliente_id)')
            .order('fecha_pago', { ascending: false })
            .limit(500);

        if (desde) query = query.gte('fecha_pago', `${desde}T00:00:00.000-05:00`);
        if (hasta) query = query.lte('fecha_pago', `${hasta}T23:59:59.999-05:00`);

        const { data, error } = await query;
        if (error) this.falloPersistencia(error, 'No se pudo consultar el historial de pagos.');

        const pagos = data ?? [];
        const porDia = new Map<string, { fecha: string; total: number; cantidad: number }>();

        for (const pago of pagos) {
            const fecha = this.fechaEcuador(pago.fecha_pago);
            const actual = porDia.get(fecha) ?? { fecha, total: 0, cantidad: 0 };
            actual.total = redondearDinero(actual.total + Number(pago.monto));
            actual.cantidad += 1;
            porDia.set(fecha, actual);
        }

        return {
            data: pagos,
            por_dia: [...porDia.values()].sort((a, b) => b.fecha.localeCompare(a.fecha)),
            meta: {
                total_movimientos: pagos.length,
                total_cobrado: redondearDinero(pagos.reduce((suma, pago) => suma + Number(pago.monto), 0)),
                desde: desde ?? null,
                hasta: hasta ?? null,
            },
        };
    }

    private async registrarMovimientoPago(
        ordenId: string,
        datos: { monto: number; metodo_pago: string; nota?: string },
        abonoAnterior: number,
    ) {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase
            .from('orden_pagos')
            .insert([{
                orden_id: ordenId,
                monto: datos.monto,
                metodo_pago: datos.metodo_pago,
                nota: datos.nota ?? null,
            }])
            .select()
            .single();

        if (error) {
            const { error: rollbackError } = await supabase
                .from('ordenes_pedido')
                .update({ abono: abonoAnterior })
                .eq('id', ordenId);
            if (rollbackError) {
                this.logger.error(
                    `No se pudo revertir el abono de ${ordenId} tras fallar orden_pagos [${rollbackError.code}] ${rollbackError.message}`,
                );
            }
            this.falloPersistencia(error, 'No se pudo guardar el historial del pago.');
        }

        return data;
    }

    private fechaEcuador(valor: string): string {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Guayaquil',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(new Date(valor));
    }

    async actualizarEstado(id: string, nuevoEstado: string) {
        const supabase = this.supabaseService.getClient();

        const estadosValidos = ['Pendiente', 'En Confección', 'Listo para Prueba', 'Entregado', 'Anulada'];
        if (!estadosValidos.includes(nuevoEstado)) {
            throw new BadRequestException('El estado proporcionado no es válido para el flujo de producción.');
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
