const ZONA_ECUADOR = 'America/Guayaquil';

export function fechaEmisionEcuador(ahora = new Date()) {
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: ZONA_ECUADOR,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(ahora);

    const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
        partes.find((parte) => parte.type === tipo)?.value ?? '';

    const dia = valor('day');
    const mes = valor('month');
    const anio = valor('year');

    return {
        dia,
        mes,
        anio,
        fechaEmision: `${dia}/${mes}/${anio}`,
    };
}
