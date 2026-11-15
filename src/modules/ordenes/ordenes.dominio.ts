/** Catálogo de tipos de línea (reemplaza “Otro” / “prendas”). */
export const TIPOS_ITEM_ORDEN = [
    'Confección a Medida',
    'Uniformes',
    'Arreglos',
    'Venta',
] as const;

export type TipoItemOrden = (typeof TIPOS_ITEM_ORDEN)[number];

/** Estados de producción por línea. */
export const ESTADOS_DETALLE_ORDEN = [
    'Pendiente',
    'En Confección',
    'Listo para Prueba',
    'Terminado',
    'Entregado',
    'Anulada',
] as const;

export type EstadoDetalleOrden = (typeof ESTADOS_DETALLE_ORDEN)[number];

const ALIAS_TIPO: Record<string, TipoItemOrden> = {
    otro: 'Venta',
    otros: 'Venta',
    venta: 'Venta',
    prenda: 'Venta',
    prendas: 'Venta',
    traje: 'Confección a Medida',
    'confeccion a medida': 'Confección a Medida',
    'confección a medida': 'Confección a Medida',
    uniforme: 'Uniformes',
    uniformes: 'Uniformes',
    arreglo: 'Arreglos',
    arreglos: 'Arreglos',
};

/** Normaliza aliases legacy al catálogo canónico; null si no es válido. */
export function normalizarTipoItem(valor: string): TipoItemOrden | null {
    const recortado = valor.trim();
    if ((TIPOS_ITEM_ORDEN as readonly string[]).includes(recortado)) {
        return recortado as TipoItemOrden;
    }
    return ALIAS_TIPO[recortado.toLowerCase()] ?? null;
}

export function esEstadoDetalleValido(valor: string): valor is EstadoDetalleOrden {
    return (ESTADOS_DETALLE_ORDEN as readonly string[]).includes(valor);
}

export function lineasTodasAnuladas(
    detalles: Array<{ estado?: string | null }>,
): boolean {
    if (!detalles.length) return false;
    return detalles.every((detalle) => detalle.estado === 'Anulada');
}
