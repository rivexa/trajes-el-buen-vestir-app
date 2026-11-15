import { parseEstadosFiltro, sanitizarBusquedaOrdenes } from './ordenes.consulta';

describe('ordenes.consulta', () => {
    it('parsea estados válidos separados por coma', () => {
        expect(parseEstadosFiltro('Pendiente,Terminado,Inventado')).toEqual(['Pendiente', 'Terminado']);
    });

    it('sanitiza caracteres peligrosos del search', () => {
        expect(sanitizarBusquedaOrdenes('  Juan_%Pérez  ')).toBe('Juan Pérez');
    });
});
