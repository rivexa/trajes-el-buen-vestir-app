import { normalizarTelefonoEc, waLinkDesdeE164 } from './telefono';

describe('normalizarTelefonoEc', () => {
    it('normaliza celular local 09 a E.164', () => {
        expect(normalizarTelefonoEc('0987654321')).toBe('593987654321');
        expect(normalizarTelefonoEc('+593 98 765 4321')).toBe('593987654321');
        expect(normalizarTelefonoEc('987654321')).toBe('593987654321');
    });

    it('rechaza fijo convencional y vacío', () => {
        expect(normalizarTelefonoEc('042345678')).toBeNull();
        expect(normalizarTelefonoEc('')).toBeNull();
        expect(normalizarTelefonoEc(null)).toBeNull();
    });
});

describe('waLinkDesdeE164', () => {
    it('arma wa.me con texto opcional', () => {
        expect(waLinkDesdeE164('593987654321')).toBe('https://wa.me/593987654321');
        expect(waLinkDesdeE164('593987654321', 'Hola')).toContain('text=Hola');
    });
});
