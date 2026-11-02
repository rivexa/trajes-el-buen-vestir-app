export interface RideDetalle {
    codigoPrincipal: string;
    descripcion: string;
    cantidad: string;
    precioUnitario: string;
    descuento: string;
    precioTotalSinImpuesto: string;
}

export interface RidePago {
    formaPago: string;
    total: string;
}

export interface RideCampoAdicional {
    nombre: string;
    valor: string;
}

export interface RideModelo {
    razonSocial: string;
    nombreComercial: string;
    ruc: string;
    dirMatriz: string;
    dirEstablecimiento: string;
    ambiente: string;
    tipoEmision: string;
    claveAcceso: string;
    estab: string;
    ptoEmi: string;
    secuencial: string;
    fechaEmision: string;
    tipoIdentificacionComprador: string;
    razonSocialComprador: string;
    identificacionComprador: string;
    totalSinImpuestos: string;
    totalDescuento: string;
    importeTotal: string;
    moneda: string;
    ivaValor: string;
    ivaTarifa: string;
    detalles: RideDetalle[];
    pagos: RidePago[];
    infoAdicional: RideCampoAdicional[];
    numeroComprobante: string;
}
