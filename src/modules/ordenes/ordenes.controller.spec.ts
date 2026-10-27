import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { OrdenesController } from './ordenes.controller';
import { OrdenesService } from './ordenes.service';

const ORDEN_ID = '11111111-1111-4111-8111-111111111111';

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
        app.useGlobalPipes(new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }));
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

    it('lista con página 1 y límite 10 si no hay query', async () => {
        ordenesService.obtenerTodos.mockResolvedValue({ data: [], meta: {} });

        await request(app.getHttpServer()).get('/ordenes').expect(200);
        expect(ordenesService.obtenerTodos).toHaveBeenCalledWith(1, 10, '');
    });

    it('delega el cambio de estado al servicio', async () => {
        ordenesService.actualizarEstado.mockResolvedValue({
            mensaje: 'Estado actualizado correctamente',
            estado_actual: 'Entregado',
        });

        await request(app.getHttpServer())
            .patch(`/ordenes/${ORDEN_ID}/estado`)
            .send({ estado: 'Entregado' })
            .expect(200);

        expect(ordenesService.actualizarEstado).toHaveBeenCalledWith(ORDEN_ID, 'Entregado');
    });

    it('rechaza un estado fuera del flujo de producción', async () => {
        await request(app.getHttpServer())
            .patch(`/ordenes/${ORDEN_ID}/estado`)
            .send({ estado: 'Facturada' })
            .expect(400);

        expect(ordenesService.actualizarEstado).not.toHaveBeenCalled();
    });
});
