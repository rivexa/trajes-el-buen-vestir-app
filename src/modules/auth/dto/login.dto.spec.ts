import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto';

describe('LoginDto', () => {
    it('acepta usuario y password válidos', async () => {
        const dto = plainToInstance(LoginDto, { usuario: '  admin  ', password: 'Admin123!' });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
        expect(dto.usuario).toBe('admin');
    });

    it('rechaza body vacío', async () => {
        const dto = plainToInstance(LoginDto, {});
        const errors = await validate(dto);
        expect(errors.some((error) => error.property === 'usuario')).toBe(true);
        expect(errors.some((error) => error.property === 'password')).toBe(true);
    });
});
