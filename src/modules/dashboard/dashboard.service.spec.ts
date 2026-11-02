import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SupabaseService } from '../../config/supabase.service';
import { DashboardService } from './dashboard.service';

type ResultadoConsulta = {
    data?: unknown;
    count?: number | null;
    error?: { code?: string; message?: string } | null;
};

function consultaSupabase(...resultados: ResultadoConsulta[]) {
    const cola = [...resultados];
    const consulta: any = {};
    for (const metodo of [
        'select', 'insert', 'update', 'delete', 'eq', 'gte', 'lte', 'or', 'order', 'range', 'limit', 'single',
    ]) {
        consulta[metodo] = jest.fn().mockReturnValue(consulta);
    }
    consulta.then = (
        resolve: (value: ResultadoConsulta) => unknown,
        reject?: (reason: unknown) => unknown,
    ) => {
        const resultado = cola.length > 0 ? cola.shift()! : { data: null, error: null };
        return Promise.resolve(resultado).then(resolve, reject);
    };
    return consulta;
}

const CLIENTE_A = '11111111-1111-4111-8111-111111111111';
const CLIENTE_B = '22222222-2222-4222-8222-222222222222';

describe('DashboardService', () => {
    let service: DashboardService;
    let from: jest.Mock;

    beforeEach(async () => {
        from = jest.fn();
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DashboardService,
                { provide: SupabaseService, useValue: { getClient: () => ({ from }) } },
            ],
        }).compile();
        service = module.get(DashboardService);
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-03-15T03:30:00.000Z')); // 14/03 Ecuador
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('arma el resumen con producción, cobranza, ventas y clientes', async () => {
        const ordenes = consultaSupabase({
            data: [
                {
                    id: 'o1',
                    cliente_id: CLIENTE_A,
                    estado: 'En Confección',
                    subtotal: 200,
                    abono: 50,
                    saldo: 150,
                    fecha_creacion: '2026-03-10T15:00:00.000Z',
                    fecha_entrega_estimada: '2026-03-10',
                    factura_id: null,
                },
                {
                    id: 'o2',
                    cliente_id: CLIENTE_B,
                    estado: 'Pendiente',
                    subtotal: 100,
                    abono: 0,
                    saldo: 100,
                    fecha_creacion: '2026-03-12T15:00:00.000Z',
                    fecha_entrega_estimada: '2026-03-18',
                    factura_id: null,
                },
                {
                    id: 'o3',
                    cliente_id: CLIENTE_A,
                    estado: 'Entregado',
                    subtotal: 80,
                    abono: 80,
                    saldo: 0,
                    fecha_creacion: '2026-02-01T15:00:00.000Z',
                    fecha_entrega_estimada: '2026-02-10',
                    factura_id: 'f1',
                },
            ],
            error: null,
        });
        const facturas = consultaSupabase({
            data: [
                {
                    id: 'f1',
                    cliente_id: CLIENTE_A,
                    total_factura: 80,
                    metodo_pago: 'Efectivo',
                    estado_sri: 'AUTORIZADO',
                    fecha_emision: '2026-03-05T12:00:00.000Z',
                },
                {
                    id: 'f2',
                    cliente_id: CLIENTE_B,
                    total_factura: 120,
                    metodo_pago: 'Transferencia',
                    estado_sri: 'AUTORIZADO',
                    fecha_emision: '2026-03-08T12:00:00.000Z',
                },
            ],
            error: null,
        });
        const pagos = consultaSupabase({
            data: [
                { monto: 50, fecha_pago: '2026-03-10T15:00:00.000Z', metodo_pago: 'Efectivo' },
                { monto: 20, fecha_pago: '2026-03-12T15:00:00.000Z', metodo_pago: 'Transferencia' },
            ],
            error: null,
        });
        const clientes = consultaSupabase(
            {
                data: [
                    { id: CLIENTE_A, nombres: 'Juan', apellidos: 'Pérez', fecha_creacion: '2026-03-02T15:00:00.000Z' },
                    { id: CLIENTE_B, nombres: 'Ana', apellidos: 'López', fecha_creacion: '2026-01-01T15:00:00.000Z' },
                ],
                error: null,
            },
            { data: null, count: 2, error: null },
        );

        from.mockImplementation((tabla: string) => {
            if (tabla === 'ordenes_pedido') return ordenes;
            if (tabla === 'facturas') return facturas;
            if (tabla === 'orden_pagos') return pagos;
            return clientes;
        });

        const resumen = await service.obtenerResumen('2026-03-01', '2026-03-14');

        expect(resumen.meta).toEqual({
            desde: '2026-03-01',
            hasta: '2026-03-14',
            hoy: '2026-03-14',
        });
        expect(resumen.produccion).toEqual({
            ordenes_por_estado: {
                Pendiente: 1,
                'En Confección': 1,
                'Listo para Prueba': 0,
                Entregado: 1,
                Anulada: 0,
            },
            ordenes_nuevas_periodo: 2,
            entregas_proximas: 1,
            entregas_atrasadas: 1,
        });
        expect(resumen.cobranza).toEqual({
            cartera_pendiente: 250,
            cobrado_ordenes_abiertas: 50,
            ordenes_abono_parcial: 1,
            cobros_periodo: {
                total: 70,
                por_dia: [
                    { fecha: '2026-03-12', total: 20, cantidad: 1 },
                    { fecha: '2026-03-10', total: 50, cantidad: 1 },
                ],
            },
        });
        expect(resumen.ventas).toEqual({
            total_facturado_autorizado: 200,
            facturas_autorizadas: 2,
            mix_metodo_pago: {
                Efectivo: 80,
                Transferencia: 120,
            },
        });
        expect(resumen.clientes.total).toBe(2);
        expect(resumen.clientes.altas_periodo).toBe(1);
        expect(resumen.clientes.con_saldo_pendiente).toBe(2);
        expect(resumen.clientes.top_por_facturacion[0]).toEqual({
            cliente_id: CLIENTE_B,
            nombre: 'Ana López',
            total: 120,
        });
        expect(resumen.clientes.top_por_pedidos[0].pedidos).toBe(2);
    });

    it('responde 400 si el rango de fechas es inválido', async () => {
        await expect(service.obtenerResumen('2026-03-20', '2026-03-01'))
            .rejects.toBeInstanceOf(BadRequestException);
    });
});
