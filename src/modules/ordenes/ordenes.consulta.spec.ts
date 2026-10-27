import {
    ORDENES_LIMITE_MAXIMO,
    ORDENES_LIMITE_POR_DEFECTO,
    acotarPaginacionOrdenes,
    sanitizarBusquedaOrden,
} from './ordenes.consulta';

describe('sanitizarBusquedaOrden', () => {
    it('quita comas, comodines y paréntesis del filtro de PostgREST', () => {
        expect(sanitizarBusquedaOrden('juan,nombres.eq.x%_(foo)')).toBe('juannombres.eq.xfoo');
    });

    it('devuelve vacío si solo quedan símbolos o espacios', () => {
        expect(sanitizarBusquedaOrden('  ,,,%%%  ')).toBe('');
    });
});

describe('acotarPaginacionOrdenes', () => {
    it('usa página 1 y límite 10 por defecto', () => {
        expect(acotarPaginacionOrdenes()).toEqual({
            page: 1,
            limit: ORDENES_LIMITE_POR_DEFECTO,
        });
    });

    it('sube la página mínima a 1 y recorta el límite a 50', () => {
        expect(acotarPaginacionOrdenes(-2, 100)).toEqual({
            page: 1,
            limit: ORDENES_LIMITE_MAXIMO,
        });
    });
});
