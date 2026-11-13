import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { UsuariosService } from '../usuarios/usuarios.service';
import { AuthService } from './auth.service';

const USUARIO_ID = '11111111-1111-4111-8111-111111111111';

describe('AuthService', () => {
    let service: AuthService;
    const usuariosService = {
        buscarPorUsuario: jest.fn(),
    };
    const jwtService = {
        signAsync: jest.fn().mockResolvedValue('token.jwt.de.prueba'),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthService,
                { provide: UsuariosService, useValue: usuariosService },
                { provide: JwtService, useValue: jwtService },
            ],
        }).compile();

        service = module.get(AuthService);
        jest.clearAllMocks();
        jwtService.signAsync.mockResolvedValue('token.jwt.de.prueba');
    });

    it('devuelve access_token Bearer y user sin password', async () => {
        const hash = await bcrypt.hash('Admin123!', 10);
        usuariosService.buscarPorUsuario.mockResolvedValue({
            id: USUARIO_ID,
            usuario: 'admin',
            password_hash: hash,
            nombre: 'Administrador',
            rol: 'admin',
            activo: true,
            created_at: '2026-11-13T00:00:00.000Z',
            updated_at: '2026-11-13T00:00:00.000Z',
        });

        const respuesta = await service.login({ usuario: 'admin', password: 'Admin123!' });

        expect(respuesta).toEqual({
            access_token: 'token.jwt.de.prueba',
            token_type: 'Bearer',
            user: {
                id: USUARIO_ID,
                nombre: 'Administrador',
                rol: 'admin',
            },
        });
        expect(jwtService.signAsync).toHaveBeenCalledWith({
            sub: USUARIO_ID,
            usuario: 'admin',
            rol: 'admin',
        });
        expect(JSON.stringify(respuesta)).not.toContain('password');
    });

    it('responde 401 con el mismo mensaje si el usuario no existe', async () => {
        usuariosService.buscarPorUsuario.mockResolvedValue(null);

        await expect(service.login({ usuario: 'nadie', password: 'x' }))
            .rejects.toBeInstanceOf(UnauthorizedException);
        await expect(service.login({ usuario: 'nadie', password: 'x' }))
            .rejects.toThrow('Usuario o contraseña incorrectos.');
    });

    it('responde 401 si el usuario está inactivo', async () => {
        usuariosService.buscarPorUsuario.mockResolvedValue({
            id: USUARIO_ID,
            usuario: 'admin',
            password_hash: await bcrypt.hash('Admin123!', 10),
            nombre: 'Administrador',
            rol: 'admin',
            activo: false,
            created_at: '2026-11-13T00:00:00.000Z',
            updated_at: '2026-11-13T00:00:00.000Z',
        });

        await expect(service.login({ usuario: 'admin', password: 'Admin123!' }))
            .rejects.toThrow('Usuario o contraseña incorrectos.');
    });

    it('responde 401 si la contraseña no coincide', async () => {
        usuariosService.buscarPorUsuario.mockResolvedValue({
            id: USUARIO_ID,
            usuario: 'admin',
            password_hash: await bcrypt.hash('Admin123!', 10),
            nombre: 'Administrador',
            rol: 'admin',
            activo: true,
            created_at: '2026-11-13T00:00:00.000Z',
            updated_at: '2026-11-13T00:00:00.000Z',
        });

        await expect(service.login({ usuario: 'admin', password: 'otra' }))
            .rejects.toThrow('Usuario o contraseña incorrectos.');
    });
});
