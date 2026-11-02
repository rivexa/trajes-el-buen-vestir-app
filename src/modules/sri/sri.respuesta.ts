export type EstadoRecepcionSri = 'RECIBIDA' | 'DEVUELTA' | 'DESCONOCIDO';
export type EstadoAutorizacionSri = 'AUTORIZADO' | 'NO AUTORIZADO' | 'PENDIENTE' | 'DESCONOCIDO';

export function estadoRecepcionSri(soap: string): EstadoRecepcionSri {
    if (soap.includes('<estado>RECIBIDA</estado>')) return 'RECIBIDA';
    if (soap.includes('<estado>DEVUELTA</estado>')) return 'DEVUELTA';
    return 'DESCONOCIDO';
}

export function estadoAutorizacionSri(soap: string): EstadoAutorizacionSri {
    if (soap.includes('<estado>AUTORIZADO</estado>')) return 'AUTORIZADO';
    if (soap.includes('<estado>NO AUTORIZADO</estado>')) return 'NO AUTORIZADO';
    if (soap.includes('<estado>PENDIENTE</estado>')) return 'PENDIENTE';
    return 'DESCONOCIDO';
}

/** Extrae el XML del comprobante autorizado; nunca el sobre SOAP. */
export function extraerComprobanteAutorizado(soap: string): string | null {
    const cdata = soap.match(/<comprobante>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/comprobante>/i);
    if (cdata?.[1]?.trim()) {
        return cdata[1].trim();
    }

    const plano = soap.match(/<comprobante>([\s\S]*?)<\/comprobante>/i);
    const contenido = plano?.[1]?.trim();
    if (!contenido || contenido.includes('soapenv:') || contenido.includes('autorizacionComprobante')) {
        return null;
    }
    return contenido.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

export function esXmlComprobanteFactura(xml: string | null | undefined): boolean {
    if (!xml) return false;
    const normalizado = xml.trim();
    return normalizado.includes('<factura') && !normalizado.includes('soapenv:Envelope');
}

export function codigoNumericoDesdeClave(claveAcceso: string): string | null {
    if (!/^\d{49}$/.test(claveAcceso)) return null;
    return claveAcceso.slice(39, 47);
}

export function fechaDesdeClave(claveAcceso: string): { dia: string; mes: string; anio: string; fechaEmision: string } | null {
    if (!/^\d{49}$/.test(claveAcceso)) return null;
    const dia = claveAcceso.slice(0, 2);
    const mes = claveAcceso.slice(2, 4);
    const anio = claveAcceso.slice(4, 8);
    return { dia, mes, anio, fechaEmision: `${dia}/${mes}/${anio}` };
}

export function codigoNumericoAleatorio(): string {
    return Math.floor(Math.random() * 100_000_000).toString().padStart(8, '0');
}

export function codigoFormaPago(metodoPago?: string): string {
    const metodo = (metodoPago || 'Efectivo').toLowerCase();
    if (metodo.includes('crédito') || metodo.includes('credito')) return '19';
    if (metodo.includes('débito') || metodo.includes('debito')) return '16';
    if (metodo.includes('transfer')) return '20';
    if (metodo.includes('cheque')) return '20';
    return '01';
}
