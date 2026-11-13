import { aUsuarioPublico, UsuarioRegistro } from './usuario.modelo';

describe('usuario.modelo', () => {
    it('expone el usuario público sin password_hash', () => {
        const registro: UsuarioRegistro = {
            id: '11111111-1111-4111-8111-111111111111',
            usuario: 'admin',
            password_hash: '$2b$10$secreto',
            nombre: 'Administrador',
            rol: 'admin',
            activo: true,
            created_at: '2026-11-13T00:00:00.000Z',
            updated_at: '2026-11-13T00:00:00.000Z',
        };

        expect(aUsuarioPublico(registro)).toEqual({
            id: registro.id,
            usuario: 'admin',
            nombre: 'Administrador',
            rol: 'admin',
        });
        expect(aUsuarioPublico(registro)).not.toHaveProperty('password_hash');
    });
});
