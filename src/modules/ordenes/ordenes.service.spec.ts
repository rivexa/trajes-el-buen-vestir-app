import { BadRequestException, ConflictException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SupabaseService } from '../../config/supabase.service';
import { CreateOrdenDto } from './dto/orden.dto';
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
});
