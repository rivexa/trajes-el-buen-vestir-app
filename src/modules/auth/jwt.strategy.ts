import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { aUsuarioPublico, UsuarioPublico } from '../usuarios/usuario.modelo';
import { UsuariosService } from '../usuarios/usuarios.service';
import { JwtPayload } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        configService: ConfigService,
        private readonly usuariosService: UsuariosService,
    ) {
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret) {
            throw new Error('Falta JWT_SECRET en las variables de entorno.');
        }
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: secret,
        });
    }

    async validate(payload: JwtPayload): Promise<UsuarioPublico> {
        if (!payload?.sub) {
            throw new UnauthorizedException('Token inválido.');
        }

        const registro = await this.usuariosService.buscarPorId(payload.sub);
        if (!registro || !registro.activo) {
            throw new UnauthorizedException('Token inválido.');
        }

        return aUsuarioPublico(registro);
    }
}
