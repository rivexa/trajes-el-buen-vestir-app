import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UsuarioPublico } from '../usuarios/usuario.modelo';

export const CurrentUser = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): UsuarioPublico => {
        const request = ctx.switchToHttp().getRequest<{ user: UsuarioPublico }>();
        return request.user;
    },
);
