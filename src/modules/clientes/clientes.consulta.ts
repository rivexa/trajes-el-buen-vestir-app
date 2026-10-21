export const CLIENTES_PAGINA_MINIMA = 1;
export const CLIENTES_LIMITE_MINIMO = 1;
export const CLIENTES_LIMITE_POR_DEFECTO = 10;
export const CLIENTES_LIMITE_MAXIMO = 50;
export const CLIENTES_BUSQUEDA_MAXIMA = 80;

const CARACTERES_FILTRO = /[%_,()]/g;

export function sanitizarBusquedaCliente(search = ''): string {
    return search.replace(CARACTERES_FILTRO, '').trim().slice(0, CLIENTES_BUSQUEDA_MAXIMA);
}

export function acotarPaginacionClientes(
    page = CLIENTES_PAGINA_MINIMA,
    limit = CLIENTES_LIMITE_POR_DEFECTO,
) {
    const pagina = Number.isInteger(page) && page >= CLIENTES_PAGINA_MINIMA
        ? page
        : CLIENTES_PAGINA_MINIMA;
    const tamano = Number.isInteger(limit) && limit >= CLIENTES_LIMITE_MINIMO
        ? Math.min(limit, CLIENTES_LIMITE_MAXIMO)
        : CLIENTES_LIMITE_POR_DEFECTO;
    return { page: pagina, limit: tamano };
}
