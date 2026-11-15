import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SupabaseService } from '../../config/supabase.service';
import { OrdenesService } from './ordenes.service';

type ResultadoConsulta = {
    data?: unknown;
    count?: number | null;
    error?: { code?: string; message?: string } | null;
};

function consultaSupabase(...resultados: ResultadoConsulta[]) {
    const cola = [...resultados];
    const consulta: any = {};
    for (const metodo of [
        'select', 'insert', 'update', 'delete', 'eq', 'in', 'gte', 'lte', 'or', 'order', 'range', 'limit', 'single',
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

const ORDEN_ID = '33333333-3333-4333-8333-333333333333';
const DETALLE_ID = '66666666-6666-4666-8666-666666666666';

describe('OrdenesService', () => {
    let service: OrdenesService;
    let from: jest.Mock;

    beforeEach(async () => {
        from = jest.fn();
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                OrdenesService,
                { provide: SupabaseService, useValue: { getClient: () => ({ from }) } },
            ],
        }).compile();
        service = module.get(OrdenesService);
    });

    it('debe construirse con el mock de Supabase', () => {
        expect(service).toBeDefined();
    });

    it('registra el pago en historial y actualiza el abono', async () => {
        const ordenes = consultaSupabase(
            { data: { abono: 50, saldo: 150, subtotal: 200 }, error: null },
            { data: { abono: 100, saldo: 100 }, error: null },
        );
        const detalles = consultaSupabase({
            data: [{ estado: 'Pendiente' }],
            error: null,
        });
        const pagos = consultaSupabase({
            data: {
                id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                orden_id: ORDEN_ID,
                monto: 50,
                metodo_pago: 'Transferencia',
                fecha_pago: '2026-11-02T18:00:00.000Z',
            },
            error: null,
        });
        from.mockImplementation((tabla: string) => {
            if (tabla === 'orden_pagos') return pagos;
            if (tabla === 'orden_detalles') return detalles;
            return ordenes;
        });

        await expect(service.registrarPago(ORDEN_ID, 50, {
            metodo_pago: 'Transferencia',
            nota: 'Anticipo',
        })).resolves.toEqual(expect.objectContaining({
            pago_recibido: 50,
            nuevo_abono_total: 100,
            movimiento: expect.objectContaining({ monto: 50, metodo_pago: 'Transferencia' }),
        }));
        expect(pagos.insert).toHaveBeenCalledWith([expect.objectContaining({
            orden_id: ORDEN_ID,
            monto: 50,
            metodo_pago: 'Transferencia',
            nota: 'Anticipo',
        })]);
    });

    it('responde 400 si el pago supera el saldo', async () => {
        const ordenes = consultaSupabase({
            data: { abono: 50, saldo: 20, subtotal: 70 },
            error: null,
        });
        const detalles = consultaSupabase({ data: [{ estado: 'Pendiente' }], error: null });
        from.mockImplementation((tabla: string) => (tabla === 'orden_detalles' ? detalles : ordenes));

        await expect(service.registrarPago(ORDEN_ID, 50)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('responde 409 si todas las líneas están anuladas', async () => {
        const ordenes = consultaSupabase({
            data: { abono: 0, saldo: 100, subtotal: 100 },
            error: null,
        });
        const detalles = consultaSupabase({
            data: [{ estado: 'Anulada' }, { estado: 'Anulada' }],
            error: null,
        });
        from.mockImplementation((tabla: string) => (tabla === 'orden_detalles' ? detalles : ordenes));

        await expect(service.registrarPago(ORDEN_ID, 10)).rejects.toBeInstanceOf(ConflictException);
    });

    it('actualiza el estado de una línea', async () => {
        const detalles = consultaSupabase(
            { data: { id: DETALLE_ID, orden_id: ORDEN_ID, estado: 'Pendiente' }, error: null },
            { data: { id: DETALLE_ID, orden_id: ORDEN_ID, estado: 'Terminado' }, error: null },
        );
        from.mockReturnValue(detalles);

        await expect(service.actualizarEstadoDetalle(ORDEN_ID, DETALLE_ID, 'Terminado'))
            .resolves.toEqual(expect.objectContaining({
                mensaje: 'Estado de la línea actualizado correctamente',
                detalle: expect.objectContaining({ estado: 'Terminado' }),
            }));
        expect(detalles.update).toHaveBeenCalledWith({ estado: 'Terminado' });
    });

    it('agrupa el historial de pagos por día en Ecuador', async () => {
        from.mockReturnValue(consultaSupabase({
            data: [
                {
                    id: '1',
                    orden_id: ORDEN_ID,
                    monto: 30,
                    metodo_pago: 'Efectivo',
                    fecha_pago: '2026-03-15T03:30:00.000Z',
                    ordenes_pedido: { numero_orden: 8, cliente_id: 'c1' },
                },
                {
                    id: '2',
                    orden_id: ORDEN_ID,
                    monto: 20,
                    metodo_pago: 'Efectivo',
                    fecha_pago: '2026-03-14T20:00:00.000Z',
                    ordenes_pedido: { numero_orden: 8, cliente_id: 'c1' },
                },
            ],
            error: null,
        }));

        const historial = await service.historialPagos('2026-03-01', '2026-03-31');
        expect(historial.meta.total_cobrado).toBe(50);
        expect(historial.por_dia).toEqual([
            { fecha: '2026-03-14', total: 50, cantidad: 2 },
        ]);
    });

    it('responde 404 si se piden pagos de una orden inexistente', async () => {
        from.mockReturnValue(consultaSupabase({
            data: null,
            error: { code: 'PGRST116', message: 'no rows' },
        }));

        await expect(service.obtenerPagosDeOrden(ORDEN_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
});
