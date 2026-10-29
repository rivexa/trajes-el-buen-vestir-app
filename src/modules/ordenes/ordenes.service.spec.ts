import { BadRequestException, ConflictException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SupabaseService } from '../../config/supabase.service';
import { CreateOrdenDto, UpdateOrdenDto } from './dto/orden.dto';
import { OrdenesService } from './ordenes.service';

type ResultadoConsulta = {
    data?: unknown;
    count?: number | null;
    error?: { code?: string; message?: string } | null;
};

function consultaSupabase(...resultados: ResultadoConsulta[]) {
    const cola = [...resultados];
    const consulta: any = {};
    for (const metodo of ['select', 'insert', 'update', 'delete', 'eq', 'or', 'order', 'range', 'single']) {
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

const ORDEN_ID = '11111111-1111-4111-8111-111111111111';

const ordenNueva: CreateOrdenDto = {
    cliente_id: ORDEN_ID,
    abono: 50,
    detalles: [{
        tipo_item: 'Traje',
        descripcion: 'Traje de lino',
        cantidad: 1,
        precio_unitario: 200,
    }],
};

const ordenEditada: UpdateOrdenDto = {
    fecha_entrega_estimada: '2026-11-01',
    detalles: [{
        tipo_item: 'Traje',
        descripcion: 'Traje de lino',
        cantidad: 1,
        precio_unitario: 200,
    }],
};

const detalleGuardado = {
    tipo_item: 'Saco',
    descripcion: 'Saco anterior',
    cantidad: 1,
    precio_unitario: 150,
};

describe('OrdenesService', () => {
    let service: OrdenesService;
    let from: jest.Mock;

    beforeEach(async () => {
        from = jest.fn();
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                OrdenesService,
                {
                    provide: SupabaseService,
                    useValue: { getClient: () => ({ from }) },
                },
            ],
        }).compile();

        service = module.get(OrdenesService);
    });

    it('debe construirse con el mock de Supabase', () => {
        expect(service).toBeDefined();
    });

    it('responde 404 si el cliente no existe al crear la orden', async () => {
        from.mockReturnValue(consultaSupabase({
            data: null,
            error: { code: '23503', message: 'foreign key' },
        }));

        await expect(service.crearOrden(ordenNueva)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('revierte la cabecera si fallan los detalles', async () => {
        const cabecera = consultaSupabase(
            { data: { id: ORDEN_ID }, error: null },
            { data: null, error: null },
        );
        const detalles = consultaSupabase({
            data: null,
            error: { code: '23502', message: 'not null' },
        });
        from.mockImplementation((tabla: string) => (
            tabla === 'orden_detalles' ? detalles : cabecera
        ));

        await expect(service.crearOrden(ordenNueva)).rejects.toBeInstanceOf(InternalServerErrorException);
        expect(cabecera.delete).toHaveBeenCalled();
        expect(cabecera.eq).toHaveBeenCalledWith('id', ORDEN_ID);
    });

    it('responde 400 si el pago supera el saldo', async () => {
        from.mockReturnValue(consultaSupabase({
            data: { abono: 10, saldo: 20, subtotal: 100 },
            error: null,
        }));

        await expect(service.registrarPago(ORDEN_ID, 50)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('responde 409 si el abono cambió antes de guardar el pago', async () => {
        from.mockReturnValue(consultaSupabase(
            { data: { abono: 10, saldo: 90, subtotal: 100 }, error: null },
            { data: null, error: { code: 'PGRST116', message: 'no rows' } },
        ));

        await expect(service.registrarPago(ORDEN_ID, 20)).rejects.toBeInstanceOf(ConflictException);
    });

    it('responde 404 si la orden a consultar no existe', async () => {
        from.mockReturnValue(consultaSupabase({
            data: null,
            error: { code: 'PGRST116', message: 'no rows' },
        }));

        await expect(service.obtenerOrden(ORDEN_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('sanitiza el search antes de interpolarlo en el filtro de clientes', async () => {
        const consulta = consultaSupabase({ data: [], count: 0, error: null });
        from.mockReturnValue(consulta);

        await service.obtenerTodos(1, 10, 'juan,nombres.eq.hack');

        expect(consulta.or).toHaveBeenCalledWith(
            'nombres.ilike.%juannombres.eq.hack%,apellidos.ilike.%juannombres.eq.hack%',
            { foreignTable: 'clientes' },
        );
    });

    it('no aplica filtro cuando el search queda vacío al sanitizar', async () => {
        const consulta = consultaSupabase({ data: [], count: 0, error: null });
        from.mockReturnValue(consulta);

        await service.obtenerTodos(1, 10, ',,,%%%');

        expect(consulta.or).not.toHaveBeenCalled();
        expect(consulta.eq).not.toHaveBeenCalled();
    });

    it('acota la paginación antes de consultar', async () => {
        const consulta = consultaSupabase({ data: [], count: 0, error: null });
        from.mockReturnValue(consulta);

        const resultado = await service.obtenerTodos(-1, 100, '');

        expect(consulta.range).toHaveBeenCalledWith(0, 49);
        expect(resultado.meta).toEqual({
            total: 0,
            page: 1,
            limit: 50,
            totalPages: 0,
        });
    });

    it('responde 400 si el estado no pertenece al flujo de producción', async () => {
        await expect(service.actualizarEstado(ORDEN_ID, 'Facturada')).rejects.toBeInstanceOf(BadRequestException);
        expect(from).not.toHaveBeenCalled();
    });

    it('responde 409 si se intenta cambiar el estado de una orden anulada', async () => {
        from.mockReturnValue(consultaSupabase({
            data: { id: ORDEN_ID, estado: 'Anulada' },
            error: null,
        }));

        await expect(service.actualizarEstado(ORDEN_ID, 'Entregado')).rejects.toBeInstanceOf(ConflictException);
    });

    it('responde 409 si se intenta editar una orden anulada', async () => {
        from.mockReturnValue(consultaSupabase({
            data: {
                id: ORDEN_ID,
                estado: 'Anulada',
                factura_id: null,
                abono: 0,
                orden_detalles: [],
            },
            error: null,
        }));

        await expect(service.actualizarOrden(ORDEN_ID, ordenEditada)).rejects.toBeInstanceOf(ConflictException);
    });

    it('responde 409 si se intenta editar una orden facturada', async () => {
        from.mockReturnValue(consultaSupabase({
            data: {
                id: ORDEN_ID,
                estado: 'Pendiente',
                factura_id: ORDEN_ID,
                abono: 50,
                orden_detalles: [detalleGuardado],
            },
            error: null,
        }));

        await expect(service.actualizarOrden(ORDEN_ID, ordenEditada)).rejects.toBeInstanceOf(ConflictException);
    });

    it('responde 400 si el nuevo subtotal es menor que el abono acumulado', async () => {
        from.mockReturnValue(consultaSupabase({
            data: {
                id: ORDEN_ID,
                estado: 'Pendiente',
                factura_id: null,
                abono: 250,
                orden_detalles: [detalleGuardado],
            },
            error: null,
        }));

        await expect(service.actualizarOrden(ORDEN_ID, ordenEditada)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('restaura los detalles anteriores si el insert de la edición falla', async () => {
        const cabecera = consultaSupabase({
            data: {
                id: ORDEN_ID,
                estado: 'Pendiente',
                factura_id: null,
                abono: 50,
                orden_detalles: [detalleGuardado],
            },
            error: null,
        });
        const detalles = consultaSupabase(
            { data: null, error: null },
            { data: null, error: { code: '23502', message: 'not null' } },
            { data: null, error: null },
        );
        from.mockImplementation((tabla: string) => (
            tabla === 'orden_detalles' ? detalles : cabecera
        ));

        await expect(service.actualizarOrden(ORDEN_ID, ordenEditada)).rejects.toBeInstanceOf(InternalServerErrorException);
        expect(detalles.insert).toHaveBeenCalledTimes(2);
        expect(detalles.insert).toHaveBeenNthCalledWith(2, [expect.objectContaining({
            orden_id: ORDEN_ID,
            descripcion: 'Saco anterior',
        })]);
        expect(cabecera.update).not.toHaveBeenCalled();
    });

    it('actualiza subtotal y fecha sin pisar el abono', async () => {
        const cabecera = consultaSupabase(
            {
                data: {
                    id: ORDEN_ID,
                    estado: 'Pendiente',
                    factura_id: null,
                    abono: 50,
                    orden_detalles: [detalleGuardado],
                },
                error: null,
            },
            { data: null, error: null },
        );
        const detalles = consultaSupabase(
            { data: null, error: null },
            { data: null, error: null },
        );
        from.mockImplementation((tabla: string) => (
            tabla === 'orden_detalles' ? detalles : cabecera
        ));

        await expect(service.actualizarOrden(ORDEN_ID, ordenEditada)).resolves.toEqual({
            mensaje: 'Orden actualizada exitosamente',
        });
        expect(cabecera.update).toHaveBeenCalledWith({
            subtotal: 200,
            fecha_entrega_estimada: '2026-11-01',
        });
    });
});
