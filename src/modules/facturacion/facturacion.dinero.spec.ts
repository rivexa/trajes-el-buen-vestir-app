import { redondearDinero, subtotalDetalles } from './facturacion.dinero';

describe('facturacion.dinero', () => {
    it('redondea a 2 decimales', () => {
        expect(redondearDinero(10.125)).toBe(10.13);
        expect(redondearDinero(10.124)).toBe(10.12);
    });

    it('suma el subtotal de los detalles con precios redondeados', () => {
        expect(subtotalDetalles([
            { cantidad: 2, precio_unitario: 10.125 },
            { cantidad: 1, precio_unitario: 5 },
        ])).toBe(25.26);
    });
});
