import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../config/supabase.service';
import { MensajeriaService } from '../mensajeria/mensajeria.service';
import { CreateOrdenDto, OrdenDetalleDto } from './dto/orden.dto';
import { lineasTodasAnuladas, normalizarTipoItem } from './ordenes.dominio';
import {
    ORDENES_LIMITE_POR_DEFECTO,
    ORDENES_PAGINA_MINIMA,
    OrdenesListadoQuery,
    clasificarBusquedaOrden,
    parseEstadosFiltro,
} from './ordenes.consulta';
import { redondearDinero, subtotalDetalles } from './ordenes.dinero';

@Injectable()
export class OrdenesService {
    private readonly logger = new Logger(OrdenesService.name);

    constructor(
        private readonly supabaseService: SupabaseService,
        private readonly mensajeriaService: MensajeriaService,
    ) { }

    async obtenerTodos(query: OrdenesListadoQuery = {}) {
        const supabase = this.supabaseService.getClient();
        const page = Math.max(ORDENES_PAGINA_MINIMA, Number(query.page) || ORDENES_PAGINA_MINIMA);
        const limit = Math.min(100, Math.max(1, Number(query.limit) || ORDENES_LIMITE_POR_DEFECTO));
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        const estados = parseEstadosFiltro(query.estado);
        const filtraPorDetalle = estados.length > 0 || Boolean(query.desde) || Boolean(query.hasta)
            || query.sort === 'fecha_entrega';

        let builder = supabase
            .from('ordenes_pedido')
            .select(
                filtraPorDetalle
                    ? '*, clientes!inner(nombres, apellidos, cedula_ruc), orden_detalles!inner(id, tipo_item, estado, fecha_entrega, descripcion, cantidad, precio_unitario, imagen_referencia_url)'
                    : '*, clientes!inner(nombres, apellidos, cedula_ruc), orden_detalles(id, tipo_item, estado, fecha_entrega, descripcion, cantidad, precio_unitario, imagen_referencia_url)',
                { count: 'exact' },
            );

        const busqueda = clasificarBusquedaOrden(query.search);
        if (busqueda.tipo === 'cedula') {
            builder = builder.eq('clientes.cedula_ruc', busqueda.valor);
        } else if (busqueda.tipo === 'numero_orden') {
            builder = builder.eq('numero_orden', busqueda.valor);
        } else if (busqueda.tipo === 'cliente') {
            builder = builder.or(
                `nombres.ilike.%${busqueda.valor}%,apellidos.ilike.%${busqueda.valor}%,cedula_ruc.ilike.%${busqueda.valor}%`,
                { foreignTable: 'clientes' },
            );
        }

        if (estados.length === 1) {
            builder = builder.eq('orden_detalles.estado', estados[0]);
        } else if (estados.length > 1) {
            builder = builder.in('orden_detalles.estado', estados);
        }

        if (query.desde) {
            builder = builder.gte('orden_detalles.fecha_entrega', query.desde);
        }
        if (query.hasta) {
            builder = builder.lte('orden_detalles.fecha_entrega', query.hasta);
        }

        const ascending = (query.order ?? 'desc') === 'asc';
        if (query.sort === 'fecha_entrega') {
            builder = builder.order('fecha_entrega', {
                ascending,
                foreignTable: 'orden_detalles',
            });
        } else {
            builder = builder.order('fecha_creacion', { ascending });
        }

        const { data, count, error } = await builder.range(from, to);

        if (error) this.falloPersistencia(error, 'No se pudo listar las órdenes.');

        return {
            data,
            meta: {
                total: count,
                page,
                limit,
                totalPages: Math.ceil((count || 0) / limit),
                sort: query.sort === 'fecha_entrega' ? 'fecha_entrega' : 'fecha_creacion',
                order: ascending ? 'asc' : 'desc',
                estados: estados.length ? estados : null,
                desde: query.desde ?? null,
                hasta: query.hasta ?? null,
            },
        };
    }

    async crearOrden(ordenData: CreateOrdenDto) {
        const supabase = this.supabaseService.getClient();
        const { cliente_id, abono = 0, detalles, fecha_entrega_default } = ordenData;
        const lineas = this.prepararDetalles(detalles, fecha_entrega_default);
        const subtotalCalculado = subtotalDetalles(lineas);
        const abonoInicial = redondearDinero(abono);

        const { data: orden, error: ordenError } = await supabase
            .from('ordenes_pedido')
            .insert([{
                cliente_id,
                subtotal: subtotalCalculado,
                abono: abonoInicial,
            }])
            .select()
            .single();

        if (ordenError) {
            if (ordenError.code === '23503') {
                throw new NotFoundException('No se encontró el cliente indicado.');
            }
            this.falloPersistencia(ordenError, 'No se pudo registrar la orden.');
        }

        const detallesParaInsertar = lineas.map((item) => ({
            orden_id: orden.id,
            tipo_item: item.tipo_item,
            descripcion: item.descripcion,
            cantidad: item.cantidad,
            precio_unitario: redondearDinero(item.precio_unitario),
            estado: item.estado,
            fecha_entrega: item.fecha_entrega,
            imagen_referencia_url: item.imagen_referencia_url ?? null,
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

        return this.obtenerOrden(orden.id);
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

        const detalles = [...(data.orden_detalles ?? [])].sort(
            (a: { fecha_entrega?: string }, b: { fecha_entrega?: string }) =>
                String(a.fecha_entrega ?? '').localeCompare(String(b.fecha_entrega ?? '')),
        );

        return {
            ...data,
            orden_detalles: detalles,
            orden_pagos: pagos,
            anulada: lineasTodasAnuladas(detalles),
        };
    }

    async actualizarOrden(id: string, ordenData: CreateOrdenDto) {
        const supabase = this.supabaseService.getClient();
        const actual = await this.obtenerOrden(id);
        if (actual.anulada) {
            throw new ConflictException('No se puede editar una orden anulada.');
        }
        if (actual.factura_id) {
            throw new ConflictException('No se puede editar una orden que ya tiene factura.');
        }

        const { abono = 0, detalles, fecha_entrega_default } = ordenData;
        const lineas = this.prepararDetalles(detalles, fecha_entrega_default);
        const subtotalCalculado = subtotalDetalles(lineas);

        const { data: cabecera, error: cabeceraError } = await supabase
            .from('ordenes_pedido')
            .update({
                abono: redondearDinero(abono),
                subtotal: subtotalCalculado,
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

        const detallesParaInsertar = lineas.map((item) => ({
            orden_id: id,
            tipo_item: item.tipo_item,
            descripcion: item.descripcion,
            cantidad: item.cantidad,
            precio_unitario: redondearDinero(item.precio_unitario),
            estado: item.estado,
            fecha_entrega: item.fecha_entrega,
            imagen_referencia_url: item.imagen_referencia_url ?? null,
        }));

        const { error: detallesError } = await supabase.from('orden_detalles').insert(detallesParaInsertar);

        if (detallesError) this.falloPersistencia(detallesError, 'No se pudieron actualizar los detalles de la orden.');

        return this.obtenerOrden(id);
    }

    async eliminarOrden(id: string) {
        const supabase = this.supabaseService.getClient();
        const orden = await this.obtenerOrden(id);

        if (orden.anulada) {
            throw new ConflictException('Esta orden ya se encuentra anulada.');
        }

        if (orden.factura_id) {
            throw new ConflictException('No se puede anular esta orden porque ya tiene una factura asociada.');
        }

        const { error: errorUpdate } = await supabase
            .from('orden_detalles')
            .update({ estado: 'Anulada' })
            .eq('orden_id', id);

        if (errorUpdate) this.falloPersistencia(errorUpdate, 'No se pudo anular la orden.');

        const { error: cabeceraError } = await supabase
            .from('ordenes_pedido')
            .update({
                abono: 0,
                subtotal: 0,
            })
            .eq('id', id);

        if (cabeceraError) this.falloPersistencia(cabeceraError, 'No se pudo anular la orden.');

        return { mensaje: 'Orden anulada exitosamente' };
    }

    async actualizarEstadoDetalle(ordenId: string, detalleId: string, nuevoEstado: string) {
        const supabase = this.supabaseService.getClient();

        const { data: detalle, error: errorBusqueda } = await supabase
            .from('orden_detalles')
            .select('id, orden_id, estado')
            .eq('id', detalleId)
            .eq('orden_id', ordenId)
            .single();

        if (errorBusqueda && errorBusqueda.code !== 'PGRST116') {
            this.falloPersistencia(errorBusqueda, 'No se pudo consultar el detalle.');
        }
        if (errorBusqueda || !detalle) {
            throw new NotFoundException('Detalle de orden no encontrado.');
        }

        const { data, error } = await supabase
            .from('orden_detalles')
            .update({ estado: nuevoEstado })
            .eq('id', detalleId)
            .eq('orden_id', ordenId)
            .select()
            .single();

        if (error) this.falloPersistencia(error, 'No se pudo actualizar el estado de la línea.');

        let aviso: Awaited<ReturnType<MensajeriaService['avisarPorEstado']>> | null = null;
        try {
            aviso = await this.mensajeriaService.avisarPorEstado({
                detalleId,
                ordenId,
                estado: nuevoEstado,
                fechaEntrega: data?.fecha_entrega,
                descripcion: data?.descripcion,
            });
        } catch (err) {
            this.logger.error(
                `Aviso WhatsApp falló tras cambiar estado (no se revierte el estado): ${err instanceof Error ? err.message : err}`,
            );
        }

        return {
            mensaje: 'Estado de la línea actualizado correctamente',
            detalle: data,
            aviso,
        };
    }

    async registrarPago(
        id: string,
        nuevoPago: number,
        extras: { metodo_pago?: string; nota?: string } = {},
    ) {
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

        const { data: detalles, error: errorDetalles } = await supabase
            .from('orden_detalles')
            .select('estado')
            .eq('orden_id', id);

        if (errorDetalles) this.falloPersistencia(errorDetalles, 'No se pudo consultar los detalles de la orden.');
        if (lineasTodasAnuladas(detalles ?? [])) {
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

        if (error) this.falloTablaPagos(error, 'No se pudo listar los pagos de la orden.');
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
        if (error) this.falloTablaPagos(error, 'No se pudo consultar el historial de pagos.');

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

    private prepararDetalles(detalles: OrdenDetalleDto[], fechaDefault?: string) {
        return detalles.map((item) => {
            const tipo = normalizarTipoItem(item.tipo_item);
            if (!tipo) {
                throw new BadRequestException(`Tipo de ítem no válido: ${item.tipo_item}`);
            }
            const fecha_entrega = item.fecha_entrega ?? fechaDefault;
            if (!fecha_entrega) {
                throw new BadRequestException(
                    'Cada línea necesita fecha_entrega (o envíe fecha_entrega_default en la orden).',
                );
            }
            return {
                tipo_item: tipo,
                descripcion: item.descripcion,
                cantidad: item.cantidad,
                precio_unitario: item.precio_unitario,
                estado: item.estado ?? 'Pendiente',
                fecha_entrega: fecha_entrega.slice(0, 10),
                imagen_referencia_url: item.imagen_referencia_url,
            };
        });
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
            this.falloTablaPagos(error, 'No se pudo guardar el historial del pago.');
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

    private falloTablaPagos(error: { code?: string; message?: string }, mensaje: string): never {
        this.logger.error(`${mensaje} [${error.code ?? 'sin-codigo'}] ${error.message ?? ''}`);
        const detalle = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
        if (
            detalle.includes('orden_pagos')
            || detalle.includes('pgrst205')
            || detalle.includes('does not exist')
            || detalle.includes('schema cache')
        ) {
            throw new InternalServerErrorException(
                'Falta la tabla orden_pagos en Supabase. Ejecute sql/001_pagos_y_crecimiento_clientes.sql y recargue el schema del API.',
            );
        }
        throw new InternalServerErrorException(mensaje);
    }

    private falloPersistencia(error: { code?: string; message?: string }, mensaje: string): never {
        this.logger.error(`${mensaje} [${error.code ?? 'sin-codigo'}] ${error.message ?? ''}`);
        throw new InternalServerErrorException(mensaje);
    }
}
