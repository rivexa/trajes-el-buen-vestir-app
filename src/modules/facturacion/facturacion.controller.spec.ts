import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { FacturacionController } from './facturacion.controller';
import { FacturacionService } from './facturacion.service';

describe('FacturacionController', () => {
    let app: INestApplication;
    let controller: FacturacionController;
    const facturacionService = {
        obtenerTodas: jest.fn(),
        emitirFactura: jest.fn(),
        obtenerPorId: jest.fn(),
        reintentarSri: jest.fn(),
        anularFactura: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [FacturacionController],
            providers: [{ provide: FacturacionService, useValue: facturacionService }],
        }).compile();

        controller = module.get(FacturacionController);
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

    it('lista con página 1 y límite 10 si no hay query', async () => {
        facturacionService.obtenerTodas.mockResolvedValue({ data: [], meta: {} });

        await request(app.getHttpServer()).get('/facturacion').expect(200);
        expect(facturacionService.obtenerTodas).toHaveBeenCalledWith(1, 10, '');
    });

    it('rechaza un id que no es UUID', async () => {
        await request(app.getHttpServer()).delete('/facturacion/abc').expect(400);
        expect(facturacionService.anularFactura).not.toHaveBeenCalled();
    });
});
