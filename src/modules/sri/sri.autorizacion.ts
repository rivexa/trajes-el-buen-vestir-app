/** Espera inicial tras recepción RECIBIDA antes de la 1ª consulta. */
export const SRI_AUTH_ESPERA_INICIAL_MS = 2_000;

/** Espera entre reintentos de autorización. */
export const SRI_AUTH_ESPERA_ENTRE_MS = 3_000;

/** Intentos de autorización en el flujo de emisión/reintento completo. */
export const SRI_AUTH_INTENTOS_EMISION = 8;

/** Intentos al solo consultar una factura ya en PROCESANDO. */
export const SRI_AUTH_INTENTOS_CONSULTA = 3;
