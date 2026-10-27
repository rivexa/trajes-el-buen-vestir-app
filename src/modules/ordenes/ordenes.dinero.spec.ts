import { redondearDinero, subtotalDetalles } from './ordenes.dinero';

describe('redondearDinero', () => {
    it('deja el valor en 2 decimales', () => {
        expect(redondearDinero(10.129)).toBe(10.13);
    });
});

describe('subtotalDetalles', () => {
    it('suma cantidades por precio redondeado', () => {
        expect(subtotalDetalles([
            { cantidad: 1, precio_unitario: 10.125 },
            { cantidad: 2, precio_unitario: 5 },
        ])).toBe(20.13);
    });
});
