export const TIPOS_MENSAJE = [
    'LISTO_PARA_PRUEBA',
    'TERMINADO',
    'RECORDATORIO',
    'FACTURA',
] as const;

export type TipoMensaje = (typeof TIPOS_MENSAJE)[number];

export const ESTADOS_MENSAJE = ['PENDIENTE', 'ENVIADO', 'ERROR', 'OMITIDO'] as const;
export type EstadoMensaje = (typeof ESTADOS_MENSAJE)[number];

/** Estados de línea que disparan aviso automático. */
export const ESTADOS_CON_AVISO = ['Listo para Prueba', 'Terminado'] as const;

export function tipoMensajePorEstadoLinea(estado: string): TipoMensaje | null {
    if (estado === 'Listo para Prueba') return 'LISTO_PARA_PRUEBA';
    if (estado === 'Terminado') return 'TERMINADO';
    return null;
}

export interface ContextoPlantilla {
    nombreCliente: string;
    numeroOrden: string | number;
    fechaEntrega?: string;
    descripcionLinea?: string;
}
