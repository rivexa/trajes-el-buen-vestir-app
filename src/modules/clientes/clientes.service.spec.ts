import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SupabaseService } from '../../config/supabase.service';
import { ClientesService } from './clientes.service';
import { CreateClienteDto } from './dto/cliente.dto';

type ResultadoConsulta = {
    data?: unknown;
    count?: number | null;
    error?: { code?: string; message?: string } | null;
};

function consultaSupabase(resultado: ResultadoConsulta) {
    const consulta: any = {};
    for (const metodo of ['select', 'insert', 'update', 'delete', 'eq', 'or', 'order', 'range', 'single']) {
        consulta[metodo] = jest.fn().mockReturnValue(consulta);
    }
    consulta.then = (
        resolve: (value: ResultadoConsulta) => unknown,
        reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(resultado).then(resolve, reject);
    return consulta;
}

const clienteNuevo: CreateClienteDto = {
    cedula_ruc: '3012345678',
    nombres: 'Juan',
    apellidos: 'Pérez',
    correo: 'juan@example.com',
};

describe('ClientesService', () => {
    let service: ClientesService;
    let from: jest.Mock;

    beforeEach(async () => {
        from = jest.fn();
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ClientesService,
                {
                    provide: SupabaseService,
                    useValue: { getClient: () => ({ from }) },
                },
            ],
        }).compile();

        service = module.get(ClientesService);
    });

    it('debe construirse con el mock de Supabase', () => {
        expect(service).toBeDefined();
    });

    it('sanitiza el search antes de interpolarlo en el filtro', async () => {
        const consulta = consultaSupabase({ data: [], count: 0, error: null });
        from.mockReturnValue(consulta);

        await service.obtenerTodos(1, 10, 'juan,nombres.eq.hack');

        expect(consulta.or).toHaveBeenCalledWith(
            'cedula_ruc.ilike.%juannombres.eq.hack%,nombres.ilike.%juannombres.eq.hack%,apellidos.ilike.%juannombres.eq.hack%',
        );
    });

    it('no aplica filtro cuando el search queda vacío al sanitizar', async () => {
        const consulta = consultaSupabase({ data: [], count: 0, error: null });
        from.mockReturnValue(consulta);

        await service.obtenerTodos(1, 10, ',,,%%%');

        expect(consulta.or).not.toHaveBeenCalled();
    });

    it('responde 409 si la cédula o RUC ya existe', async () => {
        from.mockReturnValue(consultaSupabase({
            data: null,
            error: { code: '23505', message: 'duplicate key' },
        }));

        await expect(service.crearCliente(clienteNuevo)).rejects.toBeInstanceOf(ConflictException);
    });

    it('responde 404 si el cliente a actualizar no existe', async () => {
        from.mockReturnValue(consultaSupabase({
            data: null,
            error: { code: 'PGRST116', message: 'no rows' },
        }));

        await expect(
            service.actualizar('11111111-1111-4111-8111-111111111111', { nombres: 'Ana' }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('responde 404 si el cliente a eliminar no existe', async () => {
        from.mockReturnValue(consultaSupabase({ data: [], error: null }));

        await expect(
            service.eliminar('11111111-1111-4111-8111-111111111111'),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('responde 409 si el cliente tiene órdenes asociadas', async () => {
        from.mockReturnValue(consultaSupabase({
            data: null,
            error: { code: '23503', message: 'foreign key' },
        }));

        await expect(
            service.eliminar('11111111-1111-4111-8111-111111111111'),
        ).rejects.toBeInstanceOf(ConflictException);
    });
});
