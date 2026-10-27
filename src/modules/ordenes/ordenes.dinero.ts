export function redondearDinero(valor: number): number {
    return Number(valor.toFixed(2));
}

export function subtotalDetalles(
    detalles: Array<{ cantidad: number; precio_unitario: number }>,
): number {
    return redondearDinero(
        detalles.reduce(
            (suma, item) => suma + item.cantidad * redondearDinero(item.precio_unitario),
            0,
        ),
    );
}
