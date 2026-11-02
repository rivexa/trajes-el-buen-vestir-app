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

const ORDEN_ID = '33333333-3333-4333-8333-333333333333';

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
            { data: { abono: 50, saldo: 150, subtotal: 200, estado: 'Pendiente' }, error: null },
            { data: { abono: 100, saldo: 100 }, error: null },
        );
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
        from.mockImplementation((tabla: string) => (tabla === 'orden_pagos' ? pagos : ordenes));

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
        from.mockReturnValue(consultaSupabase({
            data: { abono: 50, saldo: 20, subtotal: 70, estado: 'Pendiente' },
            error: null,
        }));

        await expect(service.registrarPago(ORDEN_ID, 50)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('responde 409 si la orden está anulada', async () => {
        from.mockReturnValue(consultaSupabase({
            data: { abono: 0, saldo: 100, subtotal: 100, estado: 'Anulada' },
            error: null,
        }));

        await expect(service.registrarPago(ORDEN_ID, 10)).rejects.toBeInstanceOf(ConflictException);
    });

    it('agrupa el historial de pagos por día en Ecuador', async () => {
        from.mockReturnValue(consultaSupabase({
            data: [
                {
                    id: '1',
                    orden_id: ORDEN_ID,
                    monto: 30,
                    metodo_pago: 'Efectivo',
                    fecha_pago: '2026-03-15T03:30:00.000Z', // 14/03 en Ecuador
                    ordenes_pedido: { numero_orden: 8, cliente_id: 'c1' },
                },
                {
                    id: '2',
                    orden_id: ORDEN_ID,
                    monto: 20,
                    metodo_pago: 'Efectivo',
                    fecha_pago: '2026-03-14T20:00:00.000Z', // 14/03 en Ecuador
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
