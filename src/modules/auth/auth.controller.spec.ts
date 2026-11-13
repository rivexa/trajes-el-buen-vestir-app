import { ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from './public.decorator';

describe('AuthController', () => {
    let app: INestApplication;
    const authService = {
        login: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [AuthController],
            providers: [
                { provide: AuthService, useValue: authService },
                {
                    provide: APP_GUARD,
                    useValue: {
                        canActivate: (context: ExecutionContext) => {
                            const handler = context.getHandler();
                            const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, handler);
                            if (isPublic) {
                                return true;
                            }
                            const request = context.switchToHttp().getRequest();
                            request.user = {
                                id: '1',
                                usuario: 'admin',
                                nombre: 'Admin Sistema',
                                rol: 'admin',
                            };
                            return true;
                        },
                    },
                },
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

    it('POST /auth/login delega al servicio con el contrato del front', async () => {
        authService.login.mockResolvedValue({
            access_token: 'abc',
            token_type: 'Bearer',
            user: { id: '1', nombre: 'Admin', rol: 'admin' },
        });

        const respuesta = await request(app.getHttpServer())
            .post('/auth/login')
            .send({ usuario: 'admin', password: 'Admin123!' })
            .expect(200);

        expect(authService.login).toHaveBeenCalledWith({
            usuario: 'admin',
            password: 'Admin123!',
        });
        expect(respuesta.body).toEqual({
            access_token: 'abc',
            token_type: 'Bearer',
            user: { id: '1', nombre: 'Admin', rol: 'admin' },
        });
    });

    it('responde 401 con message si las credenciales fallan', async () => {
        authService.login.mockRejectedValue(
            new UnauthorizedException('Usuario o contraseña incorrectos.'),
        );

        const respuesta = await request(app.getHttpServer())
            .post('/auth/login')
            .send({ usuario: 'admin', password: 'password-incorrecta' })
            .expect(401);

        expect(respuesta.body.message).toBe('Usuario o contraseña incorrectos.');
    });

    it('responde 400 si faltan usuario o password', async () => {
        await request(app.getHttpServer())
            .post('/auth/login')
            .send({})
            .expect(400);
        expect(authService.login).not.toHaveBeenCalled();
    });

    it('GET /auth/me devuelve el usuario autenticado', async () => {
        const respuesta = await request(app.getHttpServer())
            .get('/auth/me')
            .expect(200);

        expect(respuesta.body).toEqual({
            id: '1',
            nombre: 'Admin Sistema',
            rol: 'admin',
            usuario: 'admin',
        });
    });
});
