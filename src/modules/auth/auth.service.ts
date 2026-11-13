import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsuariosService } from '../usuarios/usuarios.service';
import { LoginDto } from './dto/login.dto';

const MENSAJE_CREDENCIALES = 'Usuario o contraseña incorrectos.';

export interface AuthLoginResponse {
    access_token: string;
    token_type: 'Bearer';
    user: {
        id: string;
        nombre: string;
        rol: string;
    };
}

export interface JwtPayload {
    sub: string;
    usuario: string;
    rol: string;
}

@Injectable()
export class AuthService {
    constructor(
        private readonly usuariosService: UsuariosService,
        private readonly jwtService: JwtService,
    ) { }

    async login(dto: LoginDto): Promise<AuthLoginResponse> {
        const registro = await this.usuariosService.buscarPorUsuario(dto.usuario);

        if (!registro || !registro.activo) {
            throw new UnauthorizedException(MENSAJE_CREDENCIALES);
        }

        const passwordOk = await bcrypt.compare(dto.password, registro.password_hash);
        if (!passwordOk) {
            throw new UnauthorizedException(MENSAJE_CREDENCIALES);
        }

        const payload: JwtPayload = {
            sub: registro.id,
            usuario: registro.usuario,
            rol: registro.rol,
        };

        const access_token = await this.jwtService.signAsync(payload);

        return {
            access_token,
            token_type: 'Bearer',
            user: {
                id: registro.id,
                nombre: registro.nombre,
                rol: registro.rol,
            },
        };
    }
}
