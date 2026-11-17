/**
 * Normaliza teléfonos de Ecuador a E.164 sin "+" (formato WhatsApp Cloud API / wa.me).
 * Acepta: 09XXXXXXXX, 5939XXXXXXXX, +5939XXXXXXXX, 9XXXXXXXX.
 */
export function normalizarTelefonoEc(raw?: string | null): string | null {
    if (!raw) return null;
    const digitos = raw.replace(/\D/g, '');
    if (!digitos) return null;

    if (digitos.startsWith('593') && digitos.length === 12) {
        return digitos;
    }
    if (digitos.startsWith('0') && digitos.length === 10 && digitos[1] === '9') {
        return `593${digitos.slice(1)}`;
    }
    if (digitos.length === 9 && digitos.startsWith('9')) {
        return `593${digitos}`;
    }
    // Convencional fijo no sirve para WhatsApp móvil
    return null;
}

export function waLinkDesdeE164(telefonoE164: string, texto?: string): string {
    const base = `https://wa.me/${telefonoE164}`;
    if (!texto?.trim()) return base;
    return `${base}?text=${encodeURIComponent(texto.trim())}`;
}
