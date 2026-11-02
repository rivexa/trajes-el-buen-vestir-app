export const FACTURAS_PAGINA_MINIMA = 1;
export const FACTURAS_LIMITE_MINIMO = 1;
export const FACTURAS_LIMITE_POR_DEFECTO = 10;
export const FACTURAS_LIMITE_MAXIMO = 50;
export const FACTURAS_BUSQUEDA_MAXIMA = 80;

const CARACTERES_FILTRO = /[%_,()]/g;

export function sanitizarBusquedaFactura(search = ''): string {
    return search.replace(CARACTERES_FILTRO, '').trim().slice(0, FACTURAS_BUSQUEDA_MAXIMA);
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
