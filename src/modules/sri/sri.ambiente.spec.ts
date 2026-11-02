import {
    codigoAmbienteSri,
    resolverAmbienteSri,
    urlAutorizacionSri,
    urlRecepcionSri,
} from './sri.ambiente';

describe('resolverAmbienteSri', () => {
    it('acepta pruebas y produccion', () => {
        expect(resolverAmbienteSri('pruebas')).toBe('pruebas');
        expect(resolverAmbienteSri('produccion')).toBe('produccion');
    });

    it('rechaza ausencia o valores inválidos para no caer en producción', () => {
        expect(() => resolverAmbienteSri(undefined)).toThrow(/SRI_ENVIRONMENT/);
        expect(() => resolverAmbienteSri(null)).toThrow(/SRI_ENVIRONMENT/);
        expect(() => resolverAmbienteSri('')).toThrow(/SRI_ENVIRONMENT/);
        expect(() => resolverAmbienteSri('prod')).toThrow(/SRI_ENVIRONMENT/);
    });
});

describe('codigo y URLs SRI', () => {
    it('mapea ambiente a código y endpoints oficiales', () => {
        expect(codigoAmbienteSri('pruebas')).toBe('1');
        expect(codigoAmbienteSri('produccion')).toBe('2');
        expect(urlRecepcionSri('pruebas')).toContain('celcer.sri.gob.ec');
        expect(urlRecepcionSri('produccion')).toContain('cel.sri.gob.ec');
        expect(urlAutorizacionSri('pruebas')).toContain('AutorizacionComprobantesOffline');
        expect(urlAutorizacionSri('produccion')).toContain('cel.sri.gob.ec');
    });
});
