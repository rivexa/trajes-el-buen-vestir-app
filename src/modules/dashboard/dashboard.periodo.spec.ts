import { fechaEnDias, fechaEcuadorIso, resolverPeriodoDashboard } from './dashboard.periodo';

describe('dashboard.periodo', () => {
    it('usa el mes en curso de Ecuador si no hay fechas', () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-03-15T03:30:00.000Z')); // 14/03 Ecuador

        expect(resolverPeriodoDashboard()).toEqual(expect.objectContaining({
            desde: '2026-03-01',
            hasta: '2026-03-14',
            hoy: '2026-03-14',
        }));

        jest.useRealTimers();
    });

    it('rechaza rangos inválidos', () => {
        expect(() => resolverPeriodoDashboard('2026-03-10', '2026-03-01')).toThrow(/desde/);
        expect(() => resolverPeriodoDashboard('10-03-2026')).toThrow(/YYYY-MM-DD/);
    });

    it('calcula días sobre YYYY-MM-DD', () => {
        expect(fechaEnDias('2026-03-14', 7)).toBe('2026-03-21');
        expect(fechaEcuadorIso('2026-03-15T03:30:00.000Z')).toBe('2026-03-14');
    });
});
