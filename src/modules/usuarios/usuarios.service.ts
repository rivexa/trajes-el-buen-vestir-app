import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { SupabaseService } from '../../config/supabase.service';
import { UsuarioRegistro } from './usuario.modelo';

@Injectable()
export class UsuariosService {
    private readonly logger = new Logger(UsuariosService.name);

    constructor(private readonly supabaseService: SupabaseService) { }

    async buscarPorUsuario(usuario: string): Promise<UsuarioRegistro | null> {
        const { data, error } = await this.supabaseService.getClient()
            .from('usuarios')
            .select('id, usuario, password_hash, nombre, rol, activo, created_at, updated_at')
            .eq('usuario', usuario)
            .maybeSingle();

        if (error) {
            this.logger.error(`No se pudo consultar usuarios [${error.code}] ${error.message}`);
            throw new InternalServerErrorException('No se pudo validar las credenciales.');
        }

        return (data as UsuarioRegistro | null) ?? null;
    }

    async buscarPorId(id: string): Promise<UsuarioRegistro | null> {
        const { data, error } = await this.supabaseService.getClient()
            .from('usuarios')
            .select('id, usuario, password_hash, nombre, rol, activo, created_at, updated_at')
            .eq('id', id)
            .maybeSingle();

        if (error) {
            this.logger.error(`No se pudo consultar usuario por id [${error.code}] ${error.message}`);
            throw new InternalServerErrorException('No se pudo validar la sesión.');
        }

        return (data as UsuarioRegistro | null) ?? null;
    }
}
