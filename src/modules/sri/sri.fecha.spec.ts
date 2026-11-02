import { fechaEmisionEcuador } from './sri.fecha';

describe('fechaEmisionEcuador', () => {
    it('usa el calendario de America/Guayaquil y no UTC', () => {
        // 2026-03-15 03:30 UTC = 2026-03-14 22:30 en Ecuador (UTC-5)
        const fecha = new Date('2026-03-15T03:30:00.000Z');
        expect(fechaEmisionEcuador(fecha)).toEqual({
            dia: '14',
            mes: '03',
            anio: '2026',
            fechaEmision: '14/03/2026',
        });
    });

    it('formatea dd/MM/yyyy para la clave y el XML', () => {
        const fecha = new Date('2026-11-02T18:00:00.000Z');
        expect(fechaEmisionEcuador(fecha).fechaEmision).toBe('02/11/2026');
    });
});
