import { plainToInstance } from 'class-transformer';
import { ValidationArguments, validate } from 'class-validator';
import { CreateClienteDto, ValidarIdentificacionEcuatoriana } from './cliente.dto';

const clienteValido = {
    cedula_ruc: '3012345678',
    nombres: 'Juan',
    apellidos: 'Pérez',
    correo: 'juan@example.com',
};

async function validarCliente(payload: Record<string, unknown>) {
    const dto = plainToInstance(CreateClienteDto, payload);
    return { dto, errors: await validate(dto) };
}

describe('ValidarIdentificacionEcuatoriana', () => {
    const validator = new ValidarIdentificacionEcuatoriana();
    const args = {} as ValidationArguments;

    describe('sociedad pública', () => {
        it('acepta un RUC con establecimiento 0001', () => {
            expect(validator.validate('1760001550001', args)).toBe(true);
        });

        it('acepta un RUC con establecimiento 0002', () => {
            expect(validator.validate('1760001550002', args)).toBe(true);
        });

        it('rechaza un RUC con establecimiento 0000', () => {
            expect(validator.validate('1760001550000', args)).toBe(false);
        });

        it('rechaza un RUC con dígito verificador incorrecto', () => {
            expect(validator.validate('1760001560001', args)).toBe(false);
        });
    });

    describe('persona natural', () => {
        it('acepta una cédula de provincia 30', () => {
            expect(validator.validate('3012345678', args)).toBe(true);
        });

        it('acepta un RUC con establecimiento 002', () => {
            expect(validator.validate('3012345678002', args)).toBe(true);
        });

        it('rechaza un RUC con establecimiento 000', () => {
            expect(validator.validate('3012345678000', args)).toBe(false);
        });
    });

    describe('sociedad privada', () => {
        it('acepta un RUC con establecimiento 002', () => {
            expect(validator.validate('1790012344002', args)).toBe(true);
        });

        it('rechaza un RUC con establecimiento 000', () => {
            expect(validator.validate('1790012344000', args)).toBe(false);
        });
    });

    it('rechaza una identificación de provincia 25', () => {
        expect(validator.validate('2512345678', args)).toBe(false);
    });
});

describe('CreateClienteDto', () => {
    it('recorta espacios y acepta un nombre compuesto con espacio', async () => {
        const { dto, errors } = await validarCliente({
            ...clienteValido,
            nombres: '  María José  ',
        });
        expect(errors).toHaveLength(0);
        expect(dto.nombres).toBe('María José');
    });

    it('rechaza un nombre compuesto con guion', async () => {
        const { errors } = await validarCliente({
            ...clienteValido,
            nombres: 'María-José',
        });
        expect(errors.some((error) => error.property === 'nombres')).toBe(true);
    });

    it('rechaza nombres que solo tienen espacios', async () => {
        const { errors } = await validarCliente({
            ...clienteValido,
            nombres: '   ',
        });
        expect(errors.some((error) => error.property === 'nombres')).toBe(true);
    });

    it('acepta un teléfono convencional de Guayaquil', async () => {
        const { errors } = await validarCliente({
            ...clienteValido,
            telefono: '042345678',
        });
        expect(errors).toHaveLength(0);
    });

    it('rechaza un teléfono con prefijo 01', async () => {
        const { errors } = await validarCliente({
            ...clienteValido,
            telefono: '012345678',
        });
        expect(errors.some((error) => error.property === 'telefono')).toBe(true);
    });

    it('rechaza una dirección de más de 200 caracteres', async () => {
        const { errors } = await validarCliente({
            ...clienteValido,
            direccion: 'a'.repeat(201),
        });
        expect(errors.some((error) => error.property === 'direccion')).toBe(true);
    });
});
