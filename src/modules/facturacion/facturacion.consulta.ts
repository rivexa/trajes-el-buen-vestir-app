export const FACTURAS_PAGINA_MINIMA = 1;
export const FACTURAS_LIMITE_MINIMO = 1;
export const FACTURAS_LIMITE_POR_DEFECTO = 10;
export const FACTURAS_LIMITE_MAXIMO = 50;
export const FACTURAS_BUSQUEDA_MAXIMA = 80;

const CARACTERES_FILTRO = /[%_,()]/g;

export function sanitizarBusquedaFactura(search = ''): string {
    return search.replace(CARACTERES_FILTRO, '').trim().slice(0, FACTURAS_BUSQUEDA_MAXIMA);
}

export type BusquedaFacturaClasificada =
    | { tipo: 'vacia' }
    | { tipo: 'numero_factura'; valor: string; secuencial: number }
    | { tipo: 'cedula'; valor: string }
    | { tipo: 'cliente'; valor: string };

/**
 * Facturas: cédula / cliente (nombre) / número de factura (secuencial o numero_factura_sri).
 * Cédula/RUC: solo dígitos con longitud ≥ 10.
 */
export function clasificarBusquedaFactura(search = ''): BusquedaFacturaClasificada {
    const termino = sanitizarBusquedaFactura(search);
    if (!termino) return { tipo: 'vacia' };

    const sinPrefijo = termino.replace(/^(fac|factura)-?/i, '').trim();
    if (/^\d+$/.test(sinPrefijo)) {
        if (sinPrefijo.length >= 10) {
            return { tipo: 'cedula', valor: sinPrefijo };
        }
        return {
            tipo: 'numero_factura',
            valor: sinPrefijo,
            secuencial: parseInt(sinPrefijo, 10),
        };
    }

    return { tipo: 'cliente', valor: termino };
}

export function acotarPaginacionFacturas(
    page = FACTURAS_PAGINA_MINIMA,
    limit = FACTURAS_LIMITE_POR_DEFECTO,
) {
    const pagina = Number.isInteger(page) && page >= FACTURAS_PAGINA_MINIMA
        ? page
        : FACTURAS_PAGINA_MINIMA;
    const tamano = Number.isInteger(limit) && limit >= FACTURAS_LIMITE_MINIMO
        ? Math.min(limit, FACTURAS_LIMITE_MAXIMO)
        : FACTURAS_LIMITE_POR_DEFECTO;
    return { page: pagina, limit: tamano };
}
