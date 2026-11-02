import {
    FACTURAS_LIMITE_MAXIMO,
    FACTURAS_LIMITE_POR_DEFECTO,
    acotarPaginacionFacturas,
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
