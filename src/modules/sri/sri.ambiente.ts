export type AmbienteSri = 'pruebas' | 'produccion';

export function resolverAmbienteSri(valor: string | undefined | null): AmbienteSri {
    if (valor === 'pruebas' || valor === 'produccion') {
        return valor;
    }
    throw new Error('SRI_ENVIRONMENT debe ser "pruebas" o "produccion".');
}

export function codigoAmbienteSri(ambiente: AmbienteSri): '1' | '2' {
    return ambiente === 'pruebas' ? '1' : '2';
}

export function urlRecepcionSri(ambiente: AmbienteSri): string {
    return ambiente === 'pruebas'
        ? 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl'
        : 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl';
}

export function urlAutorizacionSri(ambiente: AmbienteSri): string {
    return ambiente === 'pruebas'
        ? 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl'
        : 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl';
}
