import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { ClientesController } from '../clientes/clientes.controller';
import { ClientesService } from '../clientes/clientes.service';
import { DashboardController } from '../dashboard/dashboard.controller';
import { DashboardService } from '../dashboard/dashboard.service';
import { OrdenesController } from '../ordenes/ordenes.controller';
import { OrdenesService } from '../ordenes/ordenes.service';
import { FacturacionController } from '../facturacion/facturacion.controller';
import { FacturacionService } from '../facturacion/facturacion.service';
import { UsuariosService } from '../usuarios/usuarios.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';

describe('JwtAuthGuard (global)', () => {
    let app: INestApplication;
    let jwtService: JwtService;

    const usuarioActivo = {
        id: '11111111-1111-1111-1111-111111111111',
        usuario: 'admin',
        password_hash: 'hash',
        nombre: 'Admin Sistema',
        rol: 'admin' as const,
        activo: true,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
    };

    const usuariosService = {
        buscarPorId: jest.fn(),
        buscarPorUsuario: jest.fn(),
    };

    const authService = {
        login: jest.fn(),
    };

    const dashboardService = {
        obtenerResumen: jest.fn(),
    };

    const clientesService = {
        obtenerTodos: jest.fn(),
        crecimiento: jest.fn(),
        buscarPorCedula: jest.fn(),
        crearCliente: jest.fn(),
        actualizar: jest.fn(),
        eliminar: jest.fn(),
    };

    const ordenesService = {
        obtenerTodos: jest.fn(),
        historialPagos: jest.fn(),
        crearOrden: jest.fn(),
        obtenerPagosDeOrden: jest.fn(),
        obtenerOrden: jest.fn(),
        actualizarEstado: jest.fn(),
        registrarPago: jest.fn(),
        eliminar: jest.fn(),
    };

    const facturacionService = {
        obtenerTodas: jest.fn(),
        emitirFactura: jest.fn(),
        obtenerPorId: jest.fn(),
        generarRide: jest.fn(),
        reintentarSri: jest.fn(),
        anularFactura: jest.fn(),
    };

    beforeEach(async () => {
        process.env.JWT_SECRET = 'test-secret-commit-4';

        const module: TestingModule = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ isGlobal: true }),
                PassportModule.register({ defaultStrategy: 'jwt' }),
                JwtModule.register({
                    secret: 'test-secret-commit-4',
                    signOptions: { expiresIn: '1h' },
                }),
            ],
            controllers: [
                AuthController,
                DashboardController,
                ClientesController,
                OrdenesController,
                FacturacionController,
            ],
            providers: [
                { provide: AuthService, useValue: authService },
                { provide: UsuariosService, useValue: usuariosService },
                { provide: DashboardService, useValue: dashboardService },
                { provide: ClientesService, useValue: clientesService },
                { provide: OrdenesService, useValue: ordenesService },
                { provide: FacturacionService, useValue: facturacionService },
                JwtStrategy,
                JwtAuthGuard,
                { provide: APP_GUARD, useClass: JwtAuthGuard },
            ],
        }).compile();

        app = module.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }));
        await app.init();
        jwtService = module.get(JwtService);
        jest.clearAllMocks();
    });

    afterEach(async () => {
        await app.close();
    });

    async function tokenVálido() {
        usuariosService.buscarPorId.mockResolvedValue(usuarioActivo);
        return jwtService.signAsync({
            sub: usuarioActivo.id,
            usuario: usuarioActivo.usuario,
            rol: usuarioActivo.rol,
        });
    }

    it('POST /auth/login queda público (sin token no responde 401 del guard)', async () => {
        authService.login.mockResolvedValue({
            access_token: 'tok',
            token_type: 'Bearer',
            user: { id: usuarioActivo.id, nombre: usuarioActivo.nombre, rol: usuarioActivo.rol },
        });

        await request(app.getHttpServer())
            .post('/auth/login')
            .send({ usuario: 'admin', password: 'Admin123!' })
            .expect(200);

        expect(authService.login).toHaveBeenCalled();
    });

    it('GET /auth/me responde 401 sin token', async () => {
        await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('GET /auth/me responde 401 con token inválido', async () => {
        await request(app.getHttpServer())
            .get('/auth/me')
            .set('Authorization', 'Bearer token-invalido')
            .expect(401);
    });

    it('GET /auth/me responde 200 con Bearer válido', async () => {
        const token = await tokenVálido();

        const respuesta = await request(app.getHttpServer())
            .get('/auth/me')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

        expect(respuesta.body).toEqual({
            id: usuarioActivo.id,
            nombre: usuarioActivo.nombre,
            rol: usuarioActivo.rol,
            usuario: usuarioActivo.usuario,
        });
    });

    it.each([
        ['GET', '/dashboard'],
        ['GET', '/clientes'],
        ['GET', '/ordenes'],
        ['GET', '/facturacion'],
    ])('%s %s responde 401 sin token', async (method, path) => {
        await request(app.getHttpServer())[method.toLowerCase()](path).expect(401);
    });

    it('smoke: login → dashboard con Bearer → 401 sin token', async () => {
        authService.login.mockResolvedValue({
            access_token: await tokenVálido(),
            token_type: 'Bearer',
            user: { id: usuarioActivo.id, nombre: usuarioActivo.nombre, rol: usuarioActivo.rol },
        });
        dashboardService.obtenerResumen.mockResolvedValue({ meta: {} });

        const login = await request(app.getHttpServer())
            .post('/auth/login')
            .send({ usuario: 'admin', password: 'Admin123!' })
            .expect(200);

        await request(app.getHttpServer())
            .get('/dashboard')
            .set('Authorization', `Bearer ${login.body.access_token}`)
            .expect(200);

        await request(app.getHttpServer()).get('/dashboard').expect(401);
        expect(dashboardService.obtenerResumen).toHaveBeenCalledTimes(1);
    });
});
