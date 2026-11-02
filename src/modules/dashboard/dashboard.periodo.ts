const ZONA_ECUADOR = 'America/Guayaquil';

function partesFecha(fecha: Date) {
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: ZONA_ECUADOR,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(fecha);

    const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
        partes.find((parte) => parte.type === tipo)?.value ?? '';

    return {
        anio: valor('year'),
        mes: valor('month'),
        dia: valor('day'),
    };
}

export function fechaEcuadorIso(fecha: Date | string): string {
    const { anio, mes, dia } = partesFecha(new Date(fecha));
    return `${anio}-${mes}-${dia}`;
}

export function resolverPeriodoDashboard(desde?: string, hasta?: string) {
    const hoy = partesFecha(new Date());
    const desdeFinal = desde?.trim() || `${hoy.anio}-${hoy.mes}-01`;
    const hastaFinal = hasta?.trim() || `${hoy.anio}-${hoy.mes}-${hoy.dia}`;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(desdeFinal) || !/^\d{4}-\d{2}-\d{2}$/.test(hastaFinal)) {
        throw new Error('Las fechas desde/hasta deben tener formato YYYY-MM-DD.');
    }
    if (desdeFinal > hastaFinal) {
        throw new Error('La fecha desde no puede ser posterior a hasta.');
    }

    return {
        desde: desdeFinal,
        hasta: hastaFinal,
        desdeIso: `${desdeFinal}T00:00:00.000-05:00`,
        hastaIso: `${hastaFinal}T23:59:59.999-05:00`,
        hoy: `${hoy.anio}-${hoy.mes}-${hoy.dia}`,
    };
}

export function fechaEnDias(baseIso: string, dias: number): string {
    const [anio, mes, dia] = baseIso.split('-').map(Number);
    const utc = new Date(Date.UTC(anio, mes - 1, dia + dias));
    const y = utc.getUTCFullYear();
    const m = String(utc.getUTCMonth() + 1).padStart(2, '0');
    const d = String(utc.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
