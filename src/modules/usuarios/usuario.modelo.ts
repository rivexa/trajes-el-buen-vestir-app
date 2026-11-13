export const ROLES_USUARIO = ['admin'] as const;

export type RolUsuario = (typeof ROLES_USUARIO)[number];

/** Fila de public.usuarios (incluye hash; no exponer en responses). */
export interface UsuarioRegistro {
    id: string;
    usuario: string;
    password_hash: string;
    nombre: string;
    rol: RolUsuario;
    activo: boolean;
    created_at: string;
    updated_at: string;
}

/** Vista segura para el panel (sin password_hash). */
export interface UsuarioPublico {
    id: string;
    usuario: string;
    nombre: string;
    rol: RolUsuario;
}

export function aUsuarioPublico(usuario: UsuarioRegistro): UsuarioPublico {
    return {
        id: usuario.id,
        usuario: usuario.usuario,
        nombre: usuario.nombre,
        rol: usuario.rol,
    };
}
