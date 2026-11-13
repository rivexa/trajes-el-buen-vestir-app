import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { UsuarioPublico } from '../usuarios/usuario.modelo';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(@Body() body: LoginDto) {
        return this.authService.login(body);
    }

    @Get('me')
    @UseGuards(JwtAuthGuard)
    me(@CurrentUser() user: UsuarioPublico) {
        return {
            id: user.id,
            nombre: user.nombre,
            rol: user.rol,
            usuario: user.usuario,
        };
    }
}
