import { tipoMensajePorEstadoLinea } from './mensajeria.tipos';

describe('tipoMensajePorEstadoLinea', () => {
    it('solo dispara en Listo para Prueba y Terminado', () => {
        expect(tipoMensajePorEstadoLinea('Listo para Prueba')).toBe('LISTO_PARA_PRUEBA');
        expect(tipoMensajePorEstadoLinea('Terminado')).toBe('TERMINADO');
        expect(tipoMensajePorEstadoLinea('Pendiente')).toBeNull();
        expect(tipoMensajePorEstadoLinea('En Confección')).toBeNull();
        expect(tipoMensajePorEstadoLinea('Entregado')).toBeNull();
        expect(tipoMensajePorEstadoLinea('Anulada')).toBeNull();
    });
});
