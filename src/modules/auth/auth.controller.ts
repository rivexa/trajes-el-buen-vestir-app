import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { UsuarioPublico } from '../usuarios/usuario.modelo';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { Public } from './public.decorator';

/** Límite anti-fuerza bruta solo en login (5 intentos / minuto por IP). */
const LOGIN_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Public()
    @Throttle(LOGIN_THROTTLE)
    @UseGuards(ThrottlerGuard)
    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(@Body() body: LoginDto) {
        return this.authService.login(body);
    }

    @Get('me')
    me(@CurrentUser() user: UsuarioPublico) {
        return {
            id: user.id,
            nombre: user.nombre,
            rol: user.rol,
            usuario: user.usuario,
        };
    }
}
