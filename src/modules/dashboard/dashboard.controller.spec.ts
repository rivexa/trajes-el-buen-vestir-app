import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

describe('DashboardController', () => {
    let app: INestApplication;
    const dashboardService = {
        obtenerResumen: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [DashboardController],
            providers: [{ provide: DashboardService, useValue: dashboardService }],
        })
            .overrideGuard(JwtAuthGuard)
            .useValue({ canActivate: () => true })
            .compile();

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

    it('expone el resumen del dashboard con el período', async () => {
        dashboardService.obtenerResumen.mockResolvedValue({ meta: { desde: '2026-03-01', hasta: '2026-03-14' } });

        await request(app.getHttpServer())
            .get('/dashboard?desde=2026-03-01&hasta=2026-03-14')
            .expect(200);

        expect(dashboardService.obtenerResumen).toHaveBeenCalledWith('2026-03-01', '2026-03-14');
    });
});
