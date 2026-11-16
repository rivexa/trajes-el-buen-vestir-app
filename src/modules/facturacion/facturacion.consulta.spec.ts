import {
    FACTURAS_LIMITE_MAXIMO,
    FACTURAS_LIMITE_POR_DEFECTO,
    acotarPaginacionFacturas,
    clasificarBusquedaFactura,
    sanitizarBusquedaFactura,
} from './facturacion.consulta';

describe('sanitizarBusquedaFactura', () => {
    it('quita comas, comodines y paréntesis del filtro de PostgREST', () => {
        expect(sanitizarBusquedaFactura('juan,nombres.eq.x%_(foo)')).toBe('juannombres.eq.xfoo');
    });

    it('devuelve vacío si solo quedan símbolos o espacios', () => {
        expect(sanitizarBusquedaFactura('  ,,,%%%  ')).toBe('');
    });
});

describe('clasificarBusquedaFactura', () => {
    it('clasifica número de factura, cédula y cliente', () => {
        expect(clasificarBusquedaFactura('8')).toEqual({
            tipo: 'numero_factura',
            valor: '8',
            secuencial: 8,
        });
        expect(clasificarBusquedaFactura('000000008')).toEqual({
            tipo: 'numero_factura',
            valor: '000000008',
            secuencial: 8,
        });
        expect(clasificarBusquedaFactura('1710034065')).toEqual({
            tipo: 'cedula',
            valor: '1710034065',
        });
        expect(clasificarBusquedaFactura('Juan')).toEqual({ tipo: 'cliente', valor: 'Juan' });
    });
});

describe('acotarPaginacionFacturas', () => {
    it('usa página 1 y límite 10 por defecto', () => {
        expect(acotarPaginacionFacturas()).toEqual({
            page: 1,
            limit: FACTURAS_LIMITE_POR_DEFECTO,
        });
    });

    it('sube la página mínima a 1 y recorta el límite a 50', () => {
        expect(acotarPaginacionFacturas(-2, 100)).toEqual({
            page: 1,
            limit: FACTURAS_LIMITE_MAXIMO,
        });
    });
});
