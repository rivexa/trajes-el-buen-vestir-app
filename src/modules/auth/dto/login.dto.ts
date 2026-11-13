import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

function recortar(value: unknown): unknown {
    return typeof value === 'string' ? value.trim() : value;
}

export class LoginDto {
    @Transform(({ value }) => recortar(value))
    @IsString({ message: 'El usuario es obligatorio.' })
    @IsNotEmpty({ message: 'El usuario es obligatorio.' })
    @MaxLength(80, { message: 'El usuario no puede superar los 80 caracteres.' })
    usuario: string;

    @IsString({ message: 'La contraseña es obligatoria.' })
    @IsNotEmpty({ message: 'La contraseña es obligatoria.' })
    @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres.' })
    @MaxLength(120, { message: 'La contraseña no puede superar los 120 caracteres.' })
    password: string;
}
