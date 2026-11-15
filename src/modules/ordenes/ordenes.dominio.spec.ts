import {
    esEstadoDetalleValido,
    lineasTodasAnuladas,
    normalizarTipoItem,
} from './ordenes.dominio';

describe('ordenes.dominio', () => {
    it('normaliza aliases legacy a Venta / Confección a Medida', () => {
        expect(normalizarTipoItem('Otro')).toBe('Venta');
        expect(normalizarTipoItem('prendas')).toBe('Venta');
        expect(normalizarTipoItem('Traje')).toBe('Confección a Medida');
        expect(normalizarTipoItem('Venta')).toBe('Venta');
        expect(normalizarTipoItem('Inventado')).toBeNull();
    });

    it('valida estados de línea', () => {
        expect(esEstadoDetalleValido('Terminado')).toBe(true);
        expect(esEstadoDetalleValido('Anulada')).toBe(true);
        expect(esEstadoDetalleValido('Cancelada')).toBe(false);
    });

    it('detecta orden con todas las líneas anuladas', () => {
        expect(lineasTodasAnuladas([{ estado: 'Anulada' }, { estado: 'Anulada' }])).toBe(true);
        expect(lineasTodasAnuladas([{ estado: 'Anulada' }, { estado: 'Pendiente' }])).toBe(false);
        expect(lineasTodasAnuladas([])).toBe(false);
    });
});
