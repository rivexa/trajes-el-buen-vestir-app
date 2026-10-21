import {
    CLIENTES_LIMITE_MAXIMO,
    CLIENTES_LIMITE_POR_DEFECTO,
    acotarPaginacionClientes,
    sanitizarBusquedaCliente,
} from './clientes.consulta';

describe('sanitizarBusquedaCliente', () => {
    it('quita comas, comodines y paréntesis del filtro de PostgREST', () => {
        expect(sanitizarBusquedaCliente('juan,nombres.eq.x%_(foo)')).toBe('juannombres.eq.xfoo');
    });

    it('devuelve vacío si solo quedan símbolos o espacios', () => {
        expect(sanitizarBusquedaCliente('  ,,,%%%  ')).toBe('');
    });
});

describe('acotarPaginacionClientes', () => {
    it('usa página 1 y límite 10 por defecto', () => {
        expect(acotarPaginacionClientes()).toEqual({
            page: 1,
            limit: CLIENTES_LIMITE_POR_DEFECTO,
        });
    });

    it('sube la página mínima a 1 y recorta el límite a 50', () => {
        expect(acotarPaginacionClientes(-2, 100)).toEqual({
            page: 1,
            limit: CLIENTES_LIMITE_MAXIMO,
        });
    });
});
