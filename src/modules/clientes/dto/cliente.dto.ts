import { IsString, Matches, IsOptional, IsEmail, IsNotEmpty, ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments, Validate, ValidateIf } from 'class-validator';
import { PartialType } from '@nestjs/swagger';

@ValidatorConstraint({ name: 'identificacionEcuatoriana', async: false })
export class ValidarIdentificacionEcuatoriana implements ValidatorConstraintInterface {
    validate(val: string, args: ValidationArguments) {
        if (!val || (val.length !== 10 && val.length !== 13)) return false;
        if (!/^\d+$/.test(val)) return false;

        const provincia = parseInt(val.substring(0, 2), 10);
        if (provincia < 1 || provincia > 24) return false;

        const tercerDigito = parseInt(val.charAt(2), 10);

        // Cédula o RUC Persona Natural
        if (tercerDigito < 6) {
            if (val.length === 13 && val.substring(10, 13) !== '001') return false;
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
            if (val.substring(10, 13) !== '001') return false;
            const coeficientes = [4, 3, 2, 7, 6, 5, 4, 3, 2];
            let suma = 0;
            for (let i = 0; i < 9; i++) suma += parseInt(val.charAt(i), 10) * coeficientes[i];
            const digitoVerificador = suma % 11 === 0 ? 0 : 11 - (suma % 11);
            return digitoVerificador === parseInt(val.charAt(9), 10);
        }

        // RUC Sociedad Pública (Tercer dígito = 6).
        // El establecimiento son los últimos 4 dígitos (índices 9 a 12).
        if (tercerDigito === 6 && val.length === 13) {
            if (val.substring(9, 13) !== '0001') return false;
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
    @Validate(ValidarIdentificacionEcuatoriana)
    cedula_ruc: string;

    @IsString()
    @Matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/, { message: 'Los nombres solo pueden contener letras y espacios.' })
    nombres: string;

    @IsString()
    @Matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/, { message: 'Los apellidos solo pueden contener letras y espacios.' })
    apellidos: string;

    @IsOptional()
    @ValidateIf(o => o.telefono !== '')
    @Matches(/^09\d{8}$|^02\d{7}$/, { message: 'El teléfono debe ser celular o convencional.' })
    telefono?: string;

    @IsNotEmpty({ message: 'El correo electrónico es obligatorio para la facturación.' })
    @IsEmail({}, { message: 'El formato del correo electrónico no es válido.' })
    correo: string;

    @IsOptional()
    @IsString()
    direccion?: string;
}

export class UpdateClienteDto extends PartialType(CreateClienteDto) {}