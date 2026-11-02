import { BadRequestException, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SupabaseService } from '../../config/supabase.service';
import { SriService } from '../sri/sri.service';
import { FacturacionService } from './facturacion.service';

type ResultadoConsulta = {
    data?: unknown;
    count?: number | null;
    error?: { code?: string; message?: string } | null;
};

function consultaSupabase(...resultados: ResultadoConsulta[]) {
    const cola = [...resultados];
    const consulta: any = {};
    for (const metodo of ['select', 'insert', 'update', 'delete', 'eq', 'in', 'is', 'or', 'order', 'range', 'single']) {
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

const CLIENTE_ID = '11111111-1111-4111-8111-111111111111';
const OTRO_CLIENTE = '22222222-2222-4222-8222-222222222222';
const ORDEN_ID = '33333333-3333-4333-8333-333333333333';
const OTRA_ORDEN = '55555555-5555-4555-8555-555555555555';
const FACTURA_ID = '44444444-4444-4444-8444-444444444444';

const cliente = {
    id: CLIENTE_ID,
    nombres: 'Juan',
    apellidos: 'Pérez',
    cedula_ruc: '1710034065',
    direccion: 'Quito',
};

const detalleOrden = {
    descripcion: 'Traje de lino',
    cantidad: 1,
    precio_unitario: 200,
};

describe('FacturacionService', () => {
    let service: FacturacionService;
    let from: jest.Mock;
    const sriService = {
        procesarFacturaElectronica: jest.fn().mockResolvedValue({
            exito: true,
            claveAcceso: '1'.repeat(49),
            xmlAutorizado: '<factura/>',
        }),
    };

    beforeEach(async () => {
        from = jest.fn();
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                FacturacionService,
                { provide: SupabaseService, useValue: { getClient: () => ({ from }) } },
                { provide: SriService, useValue: sriService },
            ],
        }).compile();

        service = module.get(FacturacionService);
        jest.clearAllMocks();
        sriService.procesarFacturaElectronica.mockResolvedValue({
            exito: true,
            claveAcceso: '1'.repeat(49),
            xmlAutorizado: '<factura/>',
        });
    });

    it('debe construirse con el mock de Supabase', () => {
        expect(service).toBeDefined();
    });

    it('responde 400 si la orden no es del cliente indicado', async () => {
        from.mockImplementation((tabla: string) => {
            if (tabla === 'clientes') return consultaSupabase({ data: cliente, error: null });
            return consultaSupabase({
                data: [{
                    id: ORDEN_ID,
                    cliente_id: OTRO_CLIENTE,
                    estado: 'Pendiente',
                    factura_id: null,
                    abono: 50,
                    saldo: 150,
                    subtotal: 200,
                    orden_detalles: [detalleOrden],
                }],
                error: null,
            });
        });

        await expect(service.emitirFactura({
            cliente_id: CLIENTE_ID,
            orden_id: ORDEN_ID,
        })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('toma los ítems de la orden y cancela su saldo', async () => {
        const clientes = consultaSupabase({ data: cliente, error: null });
        const ordenes = consultaSupabase(
            {
                data: [{
                    id: ORDEN_ID,
                    cliente_id: CLIENTE_ID,
                    estado: 'Pendiente',
                    factura_id: null,
                    abono: 50,
                    saldo: 150,
                    subtotal: 200,
                    orden_detalles: [detalleOrden],
                }],
                error: null,
            },
            { data: { id: ORDEN_ID }, error: null },
        );
        const facturas = consultaSupabase(
            { data: { id: FACTURA_ID, secuencial_local: 8 }, error: null },
            { data: null, error: null },
        );
        const detalles = consultaSupabase({ data: null, error: null });
        from.mockImplementation((tabla: string) => {
            if (tabla === 'clientes') return clientes;
            if (tabla === 'ordenes_pedido') return ordenes;
            if (tabla === 'factura_detalles') return detalles;
            return facturas;
        });

        await service.emitirFactura({
            cliente_id: CLIENTE_ID,
            orden_id: ORDEN_ID,
            detalles: [{ descripcion: 'Ítem inventado', cantidad: 1, precio_unitario: 1 }],
        });

        expect(detalles.insert).toHaveBeenCalledWith([expect.objectContaining({
            descripcion: 'Traje de lino',
            precio_unitario: 200,
        })]);
        expect(ordenes.update).toHaveBeenCalledWith({
            factura_id: FACTURA_ID,
            abono_antes_facturar: 50,
            saldo_antes_facturar: 150,
            abono: 200,
        });
        expect(sriService.procesarFacturaElectronica).toHaveBeenCalledWith(expect.objectContaining({
            subtotal: 200,
            items: [expect.objectContaining({ descripcion: 'Traje de lino' })],
        }));
    });

    it('suma varias órdenes y cancela el saldo de cada una', async () => {
        const clientes = consultaSupabase({ data: cliente, error: null });
        const ordenes = consultaSupabase(
            {
                data: [
                    {
                        id: ORDEN_ID,
                        cliente_id: CLIENTE_ID,
                        estado: 'Pendiente',
                        factura_id: null,
                        abono: 50,
                        saldo: 150,
                        subtotal: 200,
                        orden_detalles: [detalleOrden],
                    },
                    {
                        id: OTRA_ORDEN,
                        cliente_id: CLIENTE_ID,
                        estado: 'Pendiente',
                        factura_id: null,
                        abono: 0,
                        saldo: 80,
                        subtotal: 80,
                        orden_detalles: [{ descripcion: 'Camisa', cantidad: 1, precio_unitario: 80 }],
                    },
                ],
                error: null,
            },
            { data: { id: ORDEN_ID }, error: null },
            { data: { id: OTRA_ORDEN }, error: null },
        );
        const facturas = consultaSupabase(
            { data: { id: FACTURA_ID, secuencial_local: 8, orden_id: ORDEN_ID }, error: null },
            { data: null, error: null },
        );
        const detalles = consultaSupabase({ data: null, error: null });
        from.mockImplementation((tabla: string) => {
            if (tabla === 'clientes') return clientes;
            if (tabla === 'ordenes_pedido') return ordenes;
            if (tabla === 'factura_detalles') return detalles;
            return facturas;
        });

        await service.emitirFactura({
            cliente_id: CLIENTE_ID,
            orden_ids: [ORDEN_ID, OTRA_ORDEN],
        });

        expect(detalles.insert).toHaveBeenCalledWith([
            expect.objectContaining({ descripcion: 'Traje de lino', precio_unitario: 200 }),
            expect.objectContaining({ descripcion: 'Camisa', precio_unitario: 80 }),
        ]);
        expect(ordenes.update).toHaveBeenNthCalledWith(1, expect.objectContaining({
            factura_id: FACTURA_ID,
            abono: 200,
        }));
        expect(ordenes.update).toHaveBeenNthCalledWith(2, expect.objectContaining({
            factura_id: FACTURA_ID,
            abono: 80,
        }));
        expect(sriService.procesarFacturaElectronica).toHaveBeenCalledWith(expect.objectContaining({
            subtotal: 280,
        }));
    });

    it('revierte la cabecera si fallan los detalles', async () => {
        const clientes = consultaSupabase({ data: cliente, error: null });
        const facturas = consultaSupabase(
            { data: { id: FACTURA_ID, secuencial_local: 1 }, error: null },
            { data: null, error: null },
        );
        const detalles = consultaSupabase({
            data: null,
            error: { code: '23502', message: 'not null' },
        });
        from.mockImplementation((tabla: string) => {
            if (tabla === 'clientes') return clientes;
            if (tabla === 'factura_detalles') return detalles;
            return facturas;
        });

        await expect(service.emitirFactura({
            cliente_id: CLIENTE_ID,
            detalles: [{ descripcion: 'Traje', cantidad: 1, precio_unitario: 200 }],
        })).rejects.toBeInstanceOf(InternalServerErrorException);
        expect(facturas.delete).toHaveBeenCalled();
        expect(sriService.procesarFacturaElectronica).not.toHaveBeenCalled();
    });

    it('responde 409 si la orden ya tiene factura', async () => {
        from.mockImplementation((tabla: string) => {
            if (tabla === 'clientes') return consultaSupabase({ data: cliente, error: null });
            return consultaSupabase({
                data: [{
                    id: ORDEN_ID,
                    cliente_id: CLIENTE_ID,
                    estado: 'Pendiente',
                    factura_id: FACTURA_ID,
                    abono: 50,
                    saldo: 150,
                    subtotal: 200,
                    orden_detalles: [detalleOrden],
                }],
                error: null,
            });
        });

        await expect(service.emitirFactura({
            cliente_id: CLIENTE_ID,
            orden_id: ORDEN_ID,
        })).rejects.toBeInstanceOf(ConflictException);
    });
});
