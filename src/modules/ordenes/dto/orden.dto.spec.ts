import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateOrdenDto, RegistrarPagoDto } from './orden.dto';

const detalleValido = {
    tipo_item: 'Traje',
    descripcion: 'Traje de lino',
    cantidad: 1,
    precio_unitario: 200,
};

const ordenValida = {
    cliente_id: '11111111-1111-4111-8111-111111111111',
    detalles: [detalleValido],
};

async function validarOrden(payload: Record<string, unknown>) {
    const dto = plainToInstance(CreateOrdenDto, payload);
    return { dto, errors: await validate(dto) };
}

describe('CreateOrdenDto', () => {
    it('acepta una orden con un detalle y sin abono', async () => {
        const { errors } = await validarOrden(ordenValida);
        expect(errors).toHaveLength(0);
    });

    it('rechaza una orden sin detalles', async () => {
        const { errors } = await validarOrden({
            ...ordenValida,
            detalles: [],
        });
        expect(errors.some((error) => error.property === 'detalles')).toBe(true);
    });

    it('rechaza un abono mayor que el subtotal', async () => {
        const { errors } = await validarOrden({
            ...ordenValida,
            abono: 250,
        });
        expect(errors.some((error) => error.property === 'abono')).toBe(true);
    });

    it('acepta un abono igual al subtotal', async () => {
        const { errors } = await validarOrden({
            ...ordenValida,
            abono: 200,
        });
        expect(errors).toHaveLength(0);
    });

    it('rechaza un precio unitario negativo', async () => {
        const { errors } = await validarOrden({
            ...ordenValida,
            detalles: [{ ...detalleValido, precio_unitario: -10 }],
        });
        expect(errors.some((error) => error.property === 'detalles')).toBe(true);
    });

    it('rechaza una imagen que no es http o https', async () => {
        const { errors } = await validarOrden({
            ...ordenValida,
            detalles: [{ ...detalleValido, imagen_referencia_url: 'javascript:alert(1)' }],
        });
        expect(errors.some((error) => error.property === 'detalles')).toBe(true);
    });
});

describe('RegistrarPagoDto', () => {
    it('acepta un monto con dos decimales', async () => {
        const dto = plainToInstance(RegistrarPagoDto, { monto: 50.25 });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
    });

    it('rechaza un monto de 0 o negativo', async () => {
        const dto = plainToInstance(RegistrarPagoDto, { monto: 0 });
        const errors = await validate(dto);
        expect(errors.some((error) => error.property === 'monto')).toBe(true);
    });
});
