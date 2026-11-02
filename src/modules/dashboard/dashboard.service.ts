import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { SupabaseService } from '../../config/supabase.service';
import { redondearDinero } from '../ordenes/ordenes.dinero';
import { fechaEcuadorIso, fechaEnDias, resolverPeriodoDashboard } from './dashboard.periodo';

type OrdenFila = {
    id: string;
    cliente_id: string;
    estado: string;
    subtotal: number | string;
    abono: number | string;
    saldo: number | string;
    fecha_creacion: string;
    fecha_entrega_estimada: string | null;
    factura_id: string | null;
};

type FacturaFila = {
    id: string;
    cliente_id: string;
    total_factura: number | string;
    metodo_pago: string | null;
    estado_sri: string;
    fecha_emision: string;
};

type PagoFila = {
    monto: number | string;
    fecha_pago: string;
    metodo_pago: string;
};

type ClienteFila = {
    id: string;
    nombres: string;
    apellidos: string;
    fecha_creacion: string | null;
};

const ESTADOS_ABIERTOS = new Set(['Pendiente', 'En Confección', 'Listo para Prueba']);

@Injectable()
export class DashboardService {
    private readonly logger = new Logger(DashboardService.name);

    constructor(private readonly supabaseService: SupabaseService) { }

    async obtenerResumen(desde?: string, hasta?: string) {
        let periodo: ReturnType<typeof resolverPeriodoDashboard>;
        try {
            periodo = resolverPeriodoDashboard(desde, hasta);
        } catch (error: any) {
            throw new BadRequestException(error.message);
        }

        const [ordenes, facturas, pagos, clientes, totalClientes] = await Promise.all([
            this.cargarOrdenes(),
            this.cargarFacturasAutorizadas(periodo.desdeIso, periodo.hastaIso),
            this.cargarPagos(periodo.desdeIso, periodo.hastaIso),
            this.cargarClientes(),
            this.contarClientes(),
        ]);

        const ordenesPorEstado: Record<string, number> = {
            Pendiente: 0,
            'En Confección': 0,
            'Listo para Prueba': 0,
            Entregado: 0,
            Anulada: 0,
        };
        let ordenesNuevasPeriodo = 0;
        let entregasProximas = 0;
        let entregasAtrasadas = 0;
        let carteraPendiente = 0;
        let cobradoOrdenesAbiertas = 0;
        let ordenesAbonoParcial = 0;
        const pedidosPorCliente = new Map<string, number>();
        const clientesConSaldo = new Set<string>();
        const limiteProximas = fechaEnDias(periodo.hoy, 7);

        for (const orden of ordenes) {
            const estado = orden.estado || 'Pendiente';
            ordenesPorEstado[estado] = (ordenesPorEstado[estado] ?? 0) + 1;

            const subtotal = Number(orden.subtotal) || 0;
            const abono = Number(orden.abono) || 0;
            const saldo = Number(orden.saldo) || 0;
            const creacion = orden.fecha_creacion ? fechaEcuadorIso(orden.fecha_creacion) : null;
            const entrega = orden.fecha_entrega_estimada
                ? String(orden.fecha_entrega_estimada).slice(0, 10)
                : null;

            if (creacion && creacion >= periodo.desde && creacion <= periodo.hasta) {
                ordenesNuevasPeriodo += 1;
            }

            if (estado !== 'Anulada') {
                carteraPendiente += saldo;
                pedidosPorCliente.set(orden.cliente_id, (pedidosPorCliente.get(orden.cliente_id) ?? 0) + 1);
                if (saldo > 0) clientesConSaldo.add(orden.cliente_id);
                if (abono > 0 && saldo > 0) ordenesAbonoParcial += 1;
            }

            if (ESTADOS_ABIERTOS.has(estado)) {
                cobradoOrdenesAbiertas += abono;
                if (entrega && entrega < periodo.hoy) entregasAtrasadas += 1;
                if (entrega && entrega >= periodo.hoy && entrega <= limiteProximas) entregasProximas += 1;
            }
        }

        let totalFacturadoAutorizado = 0;
        const mixMetodoPago: Record<string, number> = {};
        const facturacionPorCliente = new Map<string, number>();

        for (const factura of facturas) {
            const total = Number(factura.total_factura) || 0;
            totalFacturadoAutorizado += total;
            const metodo = factura.metodo_pago || 'Efectivo';
            mixMetodoPago[metodo] = redondearDinero((mixMetodoPago[metodo] ?? 0) + total);
            facturacionPorCliente.set(
                factura.cliente_id,
                redondearDinero((facturacionPorCliente.get(factura.cliente_id) ?? 0) + total),
            );
        }

        const cobrosPorDia = new Map<string, { fecha: string; total: number; cantidad: number }>();
        let totalCobradoPeriodo = 0;
        for (const pago of pagos) {
            const monto = Number(pago.monto) || 0;
            totalCobradoPeriodo += monto;
            const fecha = fechaEcuadorIso(pago.fecha_pago);
            const actual = cobrosPorDia.get(fecha) ?? { fecha, total: 0, cantidad: 0 };
            actual.total = redondearDinero(actual.total + monto);
            actual.cantidad += 1;
            cobrosPorDia.set(fecha, actual);
        }

        const nombres = new Map(
            clientes.map((cliente) => [
                cliente.id,
                `${cliente.nombres} ${cliente.apellidos}`.trim(),
            ]),
        );

        const altasPeriodo = clientes.filter((cliente) => {
            if (!cliente.fecha_creacion) return false;
            const fecha = fechaEcuadorIso(cliente.fecha_creacion);
            return fecha >= periodo.desde && fecha <= periodo.hasta;
        }).length;

        const topPorFacturacion = [...facturacionPorCliente.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([clienteId, total]) => ({
                cliente_id: clienteId,
                nombre: nombres.get(clienteId) || 'Cliente',
                total,
            }));

        const topPorPedidos = [...pedidosPorCliente.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([clienteId, pedidos]) => ({
                cliente_id: clienteId,
                nombre: nombres.get(clienteId) || 'Cliente',
                pedidos,
            }));

        return {
            meta: {
                desde: periodo.desde,
                hasta: periodo.hasta,
                hoy: periodo.hoy,
            },
            produccion: {
                ordenes_por_estado: ordenesPorEstado,
                ordenes_nuevas_periodo: ordenesNuevasPeriodo,
                entregas_proximas: entregasProximas,
                entregas_atrasadas: entregasAtrasadas,
            },
            cobranza: {
                cartera_pendiente: redondearDinero(carteraPendiente),
                cobrado_ordenes_abiertas: redondearDinero(cobradoOrdenesAbiertas),
                ordenes_abono_parcial: ordenesAbonoParcial,
                cobros_periodo: {
                    total: redondearDinero(totalCobradoPeriodo),
                    por_dia: [...cobrosPorDia.values()].sort((a, b) => b.fecha.localeCompare(a.fecha)),
                },
            },
            ventas: {
                total_facturado_autorizado: redondearDinero(totalFacturadoAutorizado),
                facturas_autorizadas: facturas.length,
                mix_metodo_pago: mixMetodoPago,
            },
            clientes: {
                total: totalClientes,
                altas_periodo: altasPeriodo,
                con_saldo_pendiente: clientesConSaldo.size,
                top_por_facturacion: topPorFacturacion,
                top_por_pedidos: topPorPedidos,
            },
        };
    }

    private async cargarOrdenes(): Promise<OrdenFila[]> {
        const { data, error } = await this.supabaseService.getClient()
            .from('ordenes_pedido')
            .select('id, cliente_id, estado, subtotal, abono, saldo, fecha_creacion, fecha_entrega_estimada, factura_id')
            .order('fecha_creacion', { ascending: false })
            .limit(5000);

        if (error) this.falloPersistencia(error, 'No se pudieron cargar las órdenes del dashboard.');
        return (data ?? []) as OrdenFila[];
    }

    private async cargarFacturasAutorizadas(desdeIso: string, hastaIso: string): Promise<FacturaFila[]> {
        const { data, error } = await this.supabaseService.getClient()
            .from('facturas')
            .select('id, cliente_id, total_factura, metodo_pago, estado_sri, fecha_emision')
            .eq('estado_sri', 'AUTORIZADO')
            .gte('fecha_emision', desdeIso)
            .lte('fecha_emision', hastaIso)
            .limit(5000);

        if (error) this.falloPersistencia(error, 'No se pudieron cargar las facturas del dashboard.');
        return (data ?? []) as FacturaFila[];
    }

    private async cargarPagos(desdeIso: string, hastaIso: string): Promise<PagoFila[]> {
        const { data, error } = await this.supabaseService.getClient()
            .from('orden_pagos')
            .select('monto, fecha_pago, metodo_pago')
            .gte('fecha_pago', desdeIso)
            .lte('fecha_pago', hastaIso)
            .limit(5000);

        if (error) this.falloTablaPagos(error, 'No se pudieron cargar los pagos del dashboard.');
        return (data ?? []) as PagoFila[];
    }

    private async cargarClientes(): Promise<ClienteFila[]> {
        const { data, error } = await this.supabaseService.getClient()
            .from('clientes')
            .select('id, nombres, apellidos, fecha_creacion')
            .limit(5000);

        if (error) this.falloPersistencia(error, 'No se pudieron cargar los clientes del dashboard.');
        return (data ?? []) as ClienteFila[];
    }

    private async contarClientes(): Promise<number> {
        const { count, error } = await this.supabaseService.getClient()
            .from('clientes')
            .select('id', { count: 'exact', head: true });

        if (error) this.falloPersistencia(error, 'No se pudo contar los clientes.');
        return count ?? 0;
    }

    private falloTablaPagos(error: { code?: string; message?: string }, mensaje: string): never {
        this.logger.error(`${mensaje} [${error.code ?? 'sin-codigo'}] ${error.message ?? ''}`);
        if (this.esTablaPagosAusente(error)) {
            throw new InternalServerErrorException(
                'Falta la tabla orden_pagos en Supabase. Ejecute sql/001_pagos_y_crecimiento_clientes.sql y recargue el schema del API.',
            );
        }
        throw new InternalServerErrorException(mensaje);
    }

    private esTablaPagosAusente(error: { code?: string; message?: string }): boolean {
        const detalle = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
        return detalle.includes('orden_pagos')
            || detalle.includes('pgrst205')
            || detalle.includes('does not exist')
            || detalle.includes('schema cache');
    }

    private falloPersistencia(error: { code?: string; message?: string }, mensaje: string): never {
        this.logger.error(`${mensaje} [${error.code ?? 'sin-codigo'}] ${error.message ?? ''}`);
        throw new InternalServerErrorException(mensaje);
    }
}
