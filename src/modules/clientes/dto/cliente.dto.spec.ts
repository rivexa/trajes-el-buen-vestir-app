import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateClienteDto } from './cliente.dto';

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
