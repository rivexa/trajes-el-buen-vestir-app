import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DashboardController } from '../dashboard/dashboard.controller';
import { DashboardService } from '../dashboard/dashboard.service';
import { UsuariosService } from '../usuarios/usuarios.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';

describe('JwtAuthGuard', () => {
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

    beforeEach(async () => {
        process.env.JWT_SECRET = 'test-secret-commit-3';

        const module: TestingModule = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ isGlobal: true }),
                PassportModule.register({ defaultStrategy: 'jwt' }),
                JwtModule.register({
                    secret: 'test-secret-commit-3',
                    signOptions: { expiresIn: '1h' },
                }),
            ],
            controllers: [AuthController, DashboardController],
            providers: [
                { provide: AuthService, useValue: authService },
                { provide: UsuariosService, useValue: usuariosService },
                { provide: DashboardService, useValue: dashboardService },
                JwtStrategy,
                JwtAuthGuard,
            ],
        }).compile();

        app = module.createNestApplication();
        await app.init();
        jwtService = module.get(JwtService);
        jest.clearAllMocks();
    });

    afterEach(async () => {
        await app.close();
    });

    it('GET /auth/me responde 401 sin token', async () => {
        await request(app.getHttpServer()).get('/auth/me').expect(401);
        expect(usuariosService.buscarPorId).not.toHaveBeenCalled();
    });

    it('GET /auth/me responde 401 con token inválido', async () => {
        await request(app.getHttpServer())
            .get('/auth/me')
            .set('Authorization', 'Bearer token-invalido')
            .expect(401);
        expect(usuariosService.buscarPorId).not.toHaveBeenCalled();
    });

    it('GET /auth/me responde 200 con token válido', async () => {
        usuariosService.buscarPorId.mockResolvedValue(usuarioActivo);
        const token = await jwtService.signAsync({
            sub: usuarioActivo.id,
            usuario: usuarioActivo.usuario,
            rol: usuarioActivo.rol,
        });

        const respuesta = await request(app.getHttpServer())
            .get('/auth/me')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

        expect(usuariosService.buscarPorId).toHaveBeenCalledWith(usuarioActivo.id);
        expect(respuesta.body).toEqual({
            id: usuarioActivo.id,
            nombre: usuarioActivo.nombre,
            rol: usuarioActivo.rol,
            usuario: usuarioActivo.usuario,
        });
    });

    it('GET /dashboard responde 401 sin token', async () => {
        await request(app.getHttpServer()).get('/dashboard').expect(401);
        expect(dashboardService.obtenerResumen).not.toHaveBeenCalled();
    });

    it('GET /dashboard responde 200 con token válido', async () => {
        usuariosService.buscarPorId.mockResolvedValue(usuarioActivo);
        dashboardService.obtenerResumen.mockResolvedValue({ meta: { desde: null, hasta: null } });
        const token = await jwtService.signAsync({
            sub: usuarioActivo.id,
            usuario: usuarioActivo.usuario,
            rol: usuarioActivo.rol,
        });

        await request(app.getHttpServer())
            .get('/dashboard')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

        expect(dashboardService.obtenerResumen).toHaveBeenCalled();
    });
});
