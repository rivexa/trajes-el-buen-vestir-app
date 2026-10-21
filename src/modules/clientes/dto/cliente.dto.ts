import { Transform } from 'class-transformer';
import { IsString, Matches, IsOptional, IsEmail, IsNotEmpty, MaxLength, ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments, Validate } from 'class-validator';
import { OmitType, PartialType } from '@nestjs/swagger';

function recortarTexto(value: unknown): unknown {
    return typeof value === 'string' ? value.trim() : value;
}

function recortarOpcional(value: unknown): unknown {
    if (typeof value !== 'string') return value;
    const recortado = value.trim();
    return recortado === '' ? undefined : recortado;
}

@ValidatorConstraint({ name: 'identificacionEcuatoriana', async: false })
export class ValidarIdentificacionEcuatoriana implements ValidatorConstraintInterface {
    validate(val: string, args: ValidationArguments) {
        if (!val || (val.length !== 10 && val.length !== 13)) return false;
        if (!/^\d+$/.test(val)) return false;

        const provincia = parseInt(val.substring(0, 2), 10);
        const provinciaValida = (provincia >= 1 && provincia <= 24) || provincia === 30;
        if (!provinciaValida) return false;

        const tercerDigito = parseInt(val.charAt(2), 10);

        // Cédula o RUC Persona Natural
        if (tercerDigito < 6) {
            if (val.length === 13 && parseInt(val.substring(10, 13), 10) < 1) return false;
            const coeficientes = [2, 1, 2, 1, 2, 1, 2, 1, 2];
            let suma = 0;
            for (let i = 0; i < 9; i++) {
                let valor = parseInt(val.charAt(i), 10) * coeficientes[i];
                suma += valor > 9 ? valor - 9 : valor;
            }
            const digitoVerificador = suma % 10 === 0 ? 0 : 10 - (suma % 10);
            return digitoVerificador === parseInt(val.charAt(9), 10);
        }
        
        // RUC Sociedad Privada (Tercer dígito = 9)
        if (tercerDigito === 9 && val.length === 13) {
            if (parseInt(val.substring(10, 13), 10) < 1) return false;
            const coeficientes = [4, 3, 2, 7, 6, 5, 4, 3, 2];
            let suma = 0;
            for (let i = 0; i < 9; i++) suma += parseInt(val.charAt(i), 10) * coeficientes[i];
            const digitoVerificador = suma % 11 === 0 ? 0 : 11 - (suma % 11);
            return digitoVerificador === parseInt(val.charAt(9), 10);
        }

        // RUC Sociedad Pública (Tercer dígito = 6).
        // El establecimiento son los últimos 4 dígitos (índices 9 a 12).
        if (tercerDigito === 6 && val.length === 13) {
            if (parseInt(val.substring(9, 13), 10) < 1) return false;
            const coeficientes = [3, 2, 7, 6, 5, 4, 3, 2];
            let suma = 0;
            for (let i = 0; i < 8; i++) suma += parseInt(val.charAt(i), 10) * coeficientes[i];
            const digitoVerificador = suma % 11 === 0 ? 0 : 11 - (suma % 11);
            return digitoVerificador === parseInt(val.charAt(8), 10);
        }

        return false;
    }

    defaultMessage(args: ValidationArguments) {
        return 'La cédula o RUC ingresado no es válido.';
    }
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