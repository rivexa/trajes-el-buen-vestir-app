import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('POST /auth/login rate limit', () => {
    let app: INestApplication;
    const authService = {
        login: jest.fn().mockResolvedValue({
            access_token: 'tok',
            token_type: 'Bearer',
            user: { id: '1', nombre: 'Admin', rol: 'admin' },
        }),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [
                ThrottlerModule.forRoot([
                    { name: 'default', ttl: 60_000, limit: 5 },
                ]),
            ],
            controllers: [AuthController],
            providers: [
                { provide: AuthService, useValue: authService },
                {
                    provide: APP_GUARD,
                    useValue: { canActivate: () => true },
                },
                JwtAuthGuard,
            ],
        }).compile();

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

    it('responde 429 tras superar 5 intentos en la ventana', async () => {
        const body = { usuario: 'admin', password: 'Admin123!' };

        for (let i = 0; i < 5; i += 1) {
            await request(app.getHttpServer()).post('/auth/login').send(body).expect(200);
        }

        await request(app.getHttpServer()).post('/auth/login').send(body).expect(429);
        expect(authService.login).toHaveBeenCalledTimes(5);
    });
});
