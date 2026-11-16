import {
    clasificarBusquedaOrden,
    parseEstadosFiltro,
    sanitizarBusquedaOrdenes,
} from './ordenes.consulta';

describe('ordenes.consulta', () => {
    it('parsea estados válidos separados por coma', () => {
        expect(parseEstadosFiltro('Pendiente,Terminado,Inventado')).toEqual(['Pendiente', 'Terminado']);
    });

    it('sanitiza caracteres peligrosos del search', () => {
        expect(sanitizarBusquedaOrdenes('  Juan_%Pérez  ')).toBe('Juan Pérez');
    });

    it('clasifica búsqueda por número de orden, cédula y cliente', () => {
        expect(clasificarBusquedaOrden('ORD-12')).toEqual({ tipo: 'numero_orden', valor: 12 });
        expect(clasificarBusquedaOrden('1710034065')).toEqual({ tipo: 'cedula', valor: '1710034065' });
        expect(clasificarBusquedaOrden('Juan')).toEqual({ tipo: 'cliente', valor: 'Juan' });
        expect(clasificarBusquedaOrden('')).toEqual({ tipo: 'vacia' });
    });
});
