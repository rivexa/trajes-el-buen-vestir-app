export const ORDENES_PAGINA_MINIMA = 1;
export const ORDENES_LIMITE_MINIMO = 1;
export const ORDENES_LIMITE_POR_DEFECTO = 10;
export const ORDENES_LIMITE_MAXIMO = 50;
export const ORDENES_BUSQUEDA_MAXIMA = 80;

const CARACTERES_FILTRO = /[%_,()]/g;

export function sanitizarBusquedaOrden(search = ''): string {
    return search.replace(CARACTERES_FILTRO, '').trim().slice(0, ORDENES_BUSQUEDA_MAXIMA);
}

export function acotarPaginacionOrdenes(
    page = ORDENES_PAGINA_MINIMA,
    limit = ORDENES_LIMITE_POR_DEFECTO,
) {
    const pagina = Number.isInteger(page) && page >= ORDENES_PAGINA_MINIMA
        ? page
        : ORDENES_PAGINA_MINIMA;
    const tamano = Number.isInteger(limit) && limit >= ORDENES_LIMITE_MINIMO
        ? Math.min(limit, ORDENES_LIMITE_MAXIMO)
        : ORDENES_LIMITE_POR_DEFECTO;
    return { page: pagina, limit: tamano };
}
