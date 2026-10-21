import { Transform } from 'class-transformer';
import { IsString, Matches, IsOptional, IsEmail, IsNotEmpty, MaxLength, Validate } from 'class-validator';
import { OmitType, PartialType } from '@nestjs/swagger';
import { ValidarIdentificacionEcuatoriana } from './identificacion-ecuatoriana.validator';

function recortarTexto(value: unknown): unknown {
    return typeof value === 'string' ? value.trim() : value;
}

function recortarOpcional(value: unknown): unknown {
    if (typeof value !== 'string') return value;
    const recortado = value.trim();
    return recortado === '' ? undefined : recortado;
}

export class CreateClienteDto {
    @Transform(({ value }) => recortarTexto(value))
    @Validate(ValidarIdentificacionEcuatoriana)
    cedula_ruc: string;

    @Transform(({ value }) => recortarTexto(value))
    @IsString()
    @IsNotEmpty({ message: 'Los nombres son obligatorios.' })
    @MaxLength(80, { message: 'Los nombres no pueden superar los 80 caracteres.' })
    @Matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ]+(?:\s+[a-zA-ZáéíóúÁÉÍÓÚñÑ]+)*$/, {
        message: 'Los nombres solo pueden contener letras y espacios.',
    })
    nombres: string;

    @Transform(({ value }) => recortarTexto(value))
    @IsString()
    @IsNotEmpty({ message: 'Los apellidos son obligatorios.' })
    @MaxLength(80, { message: 'Los apellidos no pueden superar los 80 caracteres.' })
    @Matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ]+(?:\s+[a-zA-ZáéíóúÁÉÍÓÚñÑ]+)*$/, {
        message: 'Los apellidos solo pueden contener letras y espacios.',
    })
    apellidos: string;

    @Transform(({ value }) => recortarOpcional(value))
    @IsOptional()
    @Matches(/^09\d{8}$|^0[2-7]\d{7}$/, { message: 'El teléfono debe ser celular o convencional.' })
    telefono?: string;

    @Transform(({ value }) => recortarTexto(value))
    @IsNotEmpty({ message: 'El correo electrónico es obligatorio para la facturación.' })
    @IsEmail({}, { message: 'El formato del correo electrónico no es válido.' })
    @MaxLength(120, { message: 'El correo electrónico no puede superar los 120 caracteres.' })
    correo: string;

    @Transform(({ value }) => recortarOpcional(value))
    @IsOptional()
    @IsString()
    @MaxLength(200, { message: 'La dirección no puede superar los 200 caracteres.' })
    direccion?: string;
}

export class UpdateClienteDto extends PartialType(
    OmitType(CreateClienteDto, ['cedula_ruc'] as const),
) {}
