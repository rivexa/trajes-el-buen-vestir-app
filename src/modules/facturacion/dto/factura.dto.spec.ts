import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateFacturaDto } from './factura.dto';

const detalleValido = {
    descripcion: 'Traje de lino',
    cantidad: 1,
    precio_unitario: 200,
};

const facturaValida = {
    cliente_id: '11111111-1111-4111-8111-111111111111',
    detalles: [detalleValido],
};

async function validarFactura(payload: Record<string, unknown>) {
    const dto = plainToInstance(CreateFacturaDto, payload);
    return { dto, errors: await validate(dto) };
}

describe('CreateFacturaDto', () => {
    it('acepta una factura con un ítem y sin método de pago', async () => {
        const { errors } = await validarFactura(facturaValida);
        expect(errors).toHaveLength(0);
    });

    it('recorta la descripción y acepta el método de pago del catálogo', async () => {
        const { dto, errors } = await validarFactura({
            ...facturaValida,
            metodo_pago: '  Efectivo  ',
            detalles: [{ ...detalleValido, descripcion: '  Traje de lino  ' }],
        });
        expect(errors).toHaveLength(0);
        expect(dto.metodo_pago).toBe('Efectivo');
        expect(dto.detalles[0].descripcion).toBe('Traje de lino');
    });

    it('rechaza una factura sin ítems', async () => {
        const { errors } = await validarFactura({
            ...facturaValida,
            detalles: [],
        });
        expect(errors.some((error) => error.property === 'detalles')).toBe(true);
    });

    it('rechaza un precio unitario negativo', async () => {
        const { errors } = await validarFactura({
            ...facturaValida,
            detalles: [{ ...detalleValido, precio_unitario: -10 }],
        });
        expect(errors.some((error) => error.property === 'detalles')).toBe(true);
    });

    it('rechaza una cantidad de 0', async () => {
        const { errors } = await validarFactura({
            ...facturaValida,
            detalles: [{ ...detalleValido, cantidad: 0 }],
        });
        expect(errors.some((error) => error.property === 'detalles')).toBe(true);
    });

    it('rechaza un precio con más de 2 decimales', async () => {
        const { errors } = await validarFactura({
            ...facturaValida,
            detalles: [{ ...detalleValido, precio_unitario: 10.125 }],
        });
        expect(errors.some((error) => error.property === 'detalles')).toBe(true);
    });

    it('acepta una o varias órdenes sin mandar ítems', async () => {
        const una = await validarFactura({
            cliente_id: facturaValida.cliente_id,
            orden_id: '22222222-2222-4222-8222-222222222222',
        });
        const varias = await validarFactura({
            cliente_id: facturaValida.cliente_id,
            orden_ids: [
                '22222222-2222-4222-8222-222222222222',
                '33333333-3333-4333-8333-333333333333',
            ],
        });
        expect(una.errors).toHaveLength(0);
        expect(varias.errors).toHaveLength(0);
    });

    it('rechaza un método de pago fuera del catálogo', async () => {
        const { errors } = await validarFactura({
            ...facturaValida,
            metodo_pago: 'Cripto',
        });
        expect(errors.some((error) => error.property === 'metodo_pago')).toBe(true);
    });
});
