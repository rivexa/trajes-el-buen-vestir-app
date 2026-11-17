import { ContextoPlantilla, TipoMensaje } from './mensajeria.tipos';

/** Textos para WhatsApp (Evolution) y correo — avisos al cliente. */
export function textoCliente(tipo: TipoMensaje, ctx: ContextoPlantilla): string {
    const nombre = ctx.nombreCliente.trim() || 'cliente';
    const orden = String(ctx.numeroOrden);
    switch (tipo) {
        case 'LISTO_PARA_PRUEBA':
            return `Estimado/a ${nombre}, su pedido ORD-${orden} ya está listo para prueba. Puede acercarse para la prueba y toma de medidas de su confección.`;
        case 'TERMINADO':
            return `Estimado/a ${nombre}, su pedido ORD-${orden} ya está realizado y listo para retirar.`;
        case 'FACTURA':
            return `Estimado/a ${nombre}, su factura del pedido ORD-${orden} ya está disponible.`;
        default:
            return '';
    }
}

/** Recordatorio interno al negocio (correo + WhatsApp Evolution). */
export function textoRecordatorioNegocio(ctx: ContextoPlantilla & { tipoItem?: string; estado?: string }): string {
    const orden = String(ctx.numeroOrden);
    const tipo = ctx.tipoItem || ctx.descripcionLinea || 'pedido';
    const fecha = ctx.fechaEntrega || 'fecha próxima';
    const cliente = ctx.nombreCliente.trim() || 'cliente';
    return [
        `Recordatorio de entrega (en 2 días)`,
        `Orden: ORD-${orden}`,
        `Cliente: ${cliente}`,
        `Línea: ${tipo}`,
        `Estado: ${ctx.estado || '—'}`,
        `Fecha de entrega: ${fecha}`,
        `Descripción: ${ctx.descripcionLinea || '—'}`,
    ].join('\n');
}

export function htmlRecordatorioNegocio(ctx: ContextoPlantilla & { tipoItem?: string; estado?: string }): string {
    const orden = String(ctx.numeroOrden);
    const tipo = ctx.tipoItem || ctx.descripcionLinea || 'pedido';
    const fecha = ctx.fechaEntrega || 'fecha próxima';
    const cliente = ctx.nombreCliente.trim() || 'cliente';
    return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>Recordatorio de entrega</title></head>
<body style="font-family:Arial,sans-serif;color:#222;line-height:1.5">
  <h2 style="margin:0 0 12px">Recordatorio de entrega (en 2 días)</h2>
  <p>Hay una línea de pedido con entrega el <strong>${escapeHtml(fecha)}</strong>.</p>
  <ul>
    <li><strong>Orden:</strong> ORD-${escapeHtml(orden)}</li>
    <li><strong>Cliente:</strong> ${escapeHtml(cliente)}</li>
    <li><strong>Tipo / línea:</strong> ${escapeHtml(tipo)}</li>
    <li><strong>Estado:</strong> ${escapeHtml(ctx.estado || '—')}</li>
    <li><strong>Descripción:</strong> ${escapeHtml(ctx.descripcionLinea || '—')}</li>
  </ul>
  <p style="color:#666;font-size:13px">Trajes El Buen Vestir — aviso automático del sistema.</p>
</body>
</html>`;
}

function escapeHtml(valor: string): string {
    return valor
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
