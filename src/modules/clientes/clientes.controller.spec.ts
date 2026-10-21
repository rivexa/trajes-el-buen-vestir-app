import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { ClientesController } from './clientes.controller';
import { ClientesService } from './clientes.service';

describe('ClientesController', () => {
    let app: INestApplication;
    let controller: ClientesController;
    const clientesService = {
        obtenerTodos: jest.fn(),
        buscarPorCedula: jest.fn(),
        crearCliente: jest.fn(),
        actualizar: jest.fn(),
        eliminar: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [ClientesController],
            providers: [{ provide: ClientesService, useValue: clientesService }],
        }).compile();

        controller = module.get(ClientesController);
        app = module.createNestApplication();
        await app.init();
        jest.clearAllMocks();
    });

    afterEach(async () => {
        await app.close();
    });

    it('debe construirse con el mock del servicio', () => {
        expect(controller).toBeDefined();
    });

    it('delega el alta al servicio', async () => {
        const body = {
            cedula_ruc: '3012345678',
            nombres: 'Juan',
            apellidos: 'Pérez',
            correo: 'juan@example.com',
        };
        clientesService.crearCliente.mockResolvedValue(body);

        await expect(controller.crearCliente(body)).resolves.toEqual(body);
        expect(clientesService.crearCliente).toHaveBeenCalledWith(body);
    });

    it('rechaza un id que no es UUID', async () => {
        await request(app.getHttpServer()).delete('/clientes/abc').expect(400);
        expect(clientesService.eliminar).not.toHaveBeenCalled();
    });
});
