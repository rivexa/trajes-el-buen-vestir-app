export interface ItemFacturaSRI {
    codigoPrincipal: string;
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    descuento: number;
}

export interface ClienteSRI {
    razonSocial: string;
    identificacion: string;
    tipoIdentificacion: string;
    direccion: string;
    email?: string;
}

export interface FacturaSRIDto {
    secuencial: string;
    cliente: ClienteSRI;
    items: ItemFacturaSRI[];
    subtotal: number;
    metodoPago?: string;
    /** Reintento: misma clave de 49 dígitos. */
    claveAcceso?: string;
    /** Reintento: mismo XML firmado ya transmitido o listo para transmitir. */
    xmlFirmado?: string;
}

export type ResultadoSriEstado =
    | 'AUTORIZADO'
    | 'RECHAZADO'
    | 'PENDIENTE'
    | 'DEVUELTA'
    | 'ERROR_CONEXION';

export interface ResultadoSri {
    exito: boolean;
    estado: ResultadoSriEstado;
    claveAcceso: string;
    xmlFirmado: string;
    /** Comprobante autorizado (sin sobre SOAP). Null si aún no autorizó. */
    xmlAutorizado: string | null;
    mensaje?: string;
}
