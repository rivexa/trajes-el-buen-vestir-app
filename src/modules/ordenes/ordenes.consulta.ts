import { ESTADOS_DETALLE_ORDEN } from './ordenes.dominio';

export const ORDENES_LIMITE_POR_DEFECTO = 10;
export const ORDENES_PAGINA_MINIMA = 1;

export const ORDENES_SORT_CAMPOS = ['fecha_creacion', 'fecha_entrega'] as const;
export type OrdenesSortCampo = (typeof ORDENES_SORT_CAMPOS)[number];

export interface OrdenesListadoQuery {
    page?: number;
    limit?: number;
    search?: string;
    /** Uno o varios estados de línea, separados por coma. */
    estado?: string;
    desde?: string;
    hasta?: string;
    /** fecha_creacion (cabecera) | fecha_entrega (línea) */
    sort?: string;
    order?: 'asc' | 'desc';
}

export type BusquedaOrdenClasificada =
    | { tipo: 'vacia' }
    | { tipo: 'numero_orden'; valor: number }
    | { tipo: 'cedula'; valor: string }
    | { tipo: 'cliente'; valor: string };

export function parseEstadosFiltro(raw?: string): string[] {
    if (!raw?.trim()) return [];
    const pedidos = raw.split(',').map((valor) => valor.trim()).filter(Boolean);
    const validos = pedidos.filter((estado) =>
        (ESTADOS_DETALLE_ORDEN as readonly string[]).includes(estado),
    );
    return [...new Set(validos)];
}

export function sanitizarBusquedaOrdenes(search?: string): string {
    if (!search) return '';
    return search.trim().replace(/[%_,.()]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Órdenes: cédula / cliente (nombre) / número de orden (acepta prefijo ORD-).
 * Cédula/RUC: solo dígitos con longitud ≥ 10.
 */
export function clasificarBusquedaOrden(search?: string): BusquedaOrdenClasificada {
    const termino = sanitizarBusquedaOrdenes(search);
    if (!termino) return { tipo: 'vacia' };

    const sinPrefijo = termino.replace(/^ord-?/i, '').trim();
    if (/^\d+$/.test(sinPrefijo)) {
        if (sinPrefijo.length >= 10) {
            return { tipo: 'cedula', valor: sinPrefijo };
        }
        return { tipo: 'numero_orden', valor: parseInt(sinPrefijo, 10) };
    }

    return { tipo: 'cliente', valor: termino };
}
