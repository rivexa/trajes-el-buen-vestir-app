import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { OrdenesController } from './ordenes.controller';
import { OrdenesService } from './ordenes.service';

describe('OrdenesController', () => {
    let app: INestApplication;
    let controller: OrdenesController;
    const ordenesService = {
        obtenerTodos: jest.fn(),
        crearOrden: jest.fn(),
        obtenerOrden: jest.fn(),
        actualizarOrden: jest.fn(),
        actualizarEstado: jest.fn(),
        registrarPago: jest.fn(),
        eliminarOrden: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [OrdenesController],
            providers: [{ provide: OrdenesService, useValue: ordenesService }],
        }).compile();

        controller = module.get(OrdenesController);
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
            cliente_id: '11111111-1111-4111-8111-111111111111',
            detalles: [{
                tipo_item: 'Traje',
                descripcion: 'Traje de lino',
                cantidad: 1,
                precio_unitario: 200,
            }],
        };
        ordenesService.crearOrden.mockResolvedValue({ id: body.cliente_id });

        await expect(controller.crearOrden(body as any)).resolves.toEqual({ id: body.cliente_id });
        expect(ordenesService.crearOrden).toHaveBeenCalledWith(body);
    });

    it('rechaza un id que no es UUID', async () => {
        await request(app.getHttpServer()).delete('/ordenes/abc').expect(400);
        expect(ordenesService.eliminarOrden).not.toHaveBeenCalled();
    });
});
