import { parseStringPromise } from 'xml2js';
import { RideCampoAdicional, RideDetalle, RideModelo, RidePago } from './ride.modelo';

function texto(valor: unknown, fallback = ''): string {
    if (valor == null) return fallback;
    if (typeof valor === 'string' || typeof valor === 'number') return String(valor);
    if (Array.isArray(valor)) return texto(valor[0], fallback);
    if (typeof valor === 'object' && '_' in (valor as object)) {
        return texto((valor as { _: unknown })._, fallback);
    }
    return fallback;
}

function lista<T>(valor: unknown): T[] {
    if (valor == null) return [];
    return Array.isArray(valor) ? valor as T[] : [valor as T];
}

function etiquetaAmbiente(codigo: string): string {
    return codigo === '1' ? 'PRUEBAS' : 'PRODUCCIÓN';
}

function etiquetaEmision(codigo: string): string {
    return codigo === '1' ? 'NORMAL' : codigo;
}

function etiquetaFormaPago(codigo: string): string {
    const mapa: Record<string, string> = {
        '01': 'Efectivo',
        '16': 'Tarjeta de débito',
        '19': 'Tarjeta de crédito',
        '20': 'Otros',
    };
    return mapa[codigo] ?? codigo;
}

function etiquetaIdentificacion(codigo: string): string {
    const mapa: Record<string, string> = {
        '04': 'RUC',
        '05': 'CÉDULA',
        '06': 'PASAPORTE',
        '07': 'CONSUMIDOR FINAL',
        '08': 'IDENTIFICACIÓN DEL EXTERIOR',
    };
    return mapa[codigo] ?? codigo;
}

export async function parsearRideDesdeXml(xml: string): Promise<RideModelo> {
    const parsed = await parseStringPromise(xml, { explicitArray: false, trim: true });
    const factura = parsed?.factura;
    if (!factura?.infoTributaria || !factura?.infoFactura) {
        throw new Error('El XML no contiene una factura autorizada válida.');
    }

    const trib = factura.infoTributaria;
    const info = factura.infoFactura;
    const impuestos = lista<any>(info.totalConImpuestos?.totalImpuesto);
    const iva = impuestos.find((item) => texto(item.codigo) === '2') ?? impuestos[0] ?? {};

    const detallesXml = lista<any>(factura.detalles?.detalle);
    const detalles: RideDetalle[] = detallesXml.map((item) => ({
        codigoPrincipal: texto(item.codigoPrincipal),
        descripcion: texto(item.descripcion),
        cantidad: texto(item.cantidad, '0.00'),
        precioUnitario: texto(item.precioUnitario, '0.00'),
        descuento: texto(item.descuento, '0.00'),
        precioTotalSinImpuesto: texto(item.precioTotalSinImpuesto, '0.00'),
    }));

    const pagosXml = lista<any>(info.pagos?.pago);
    const pagos: RidePago[] = pagosXml.map((item) => ({
        formaPago: etiquetaFormaPago(texto(item.formaPago)),
        total: texto(item.total, '0.00'),
    }));

    const adicionalesXml = lista<any>(factura.infoAdicional?.campoAdicional);
    const infoAdicional: RideCampoAdicional[] = adicionalesXml.map((item) => ({
        nombre: texto(item?.$?.nombre ?? item?.nombre, 'Dato'),
        valor: texto(item),
    }));

    const estab = texto(trib.estab);
    const ptoEmi = texto(trib.ptoEmi);
    const secuencial = texto(trib.secuencial);

    return {
        razonSocial: texto(trib.razonSocial),
        nombreComercial: texto(trib.nombreComercial, texto(trib.razonSocial)),
        ruc: texto(trib.ruc),
        dirMatriz: texto(trib.dirMatriz),
        dirEstablecimiento: texto(info.dirEstablecimiento, texto(trib.dirMatriz)),
        ambiente: etiquetaAmbiente(texto(trib.ambiente)),
        tipoEmision: etiquetaEmision(texto(trib.tipoEmision)),
        claveAcceso: texto(trib.claveAcceso),
        estab,
        ptoEmi,
        secuencial,
        fechaEmision: texto(info.fechaEmision),
        tipoIdentificacionComprador: etiquetaIdentificacion(texto(info.tipoIdentificacionComprador)),
        razonSocialComprador: texto(info.razonSocialComprador),
        identificacionComprador: texto(info.identificacionComprador),
        totalSinImpuestos: texto(info.totalSinImpuestos, '0.00'),
        totalDescuento: texto(info.totalDescuento, '0.00'),
        importeTotal: texto(info.importeTotal, '0.00'),
        moneda: texto(info.moneda, 'DOLAR'),
        ivaValor: texto(iva.valor, '0.00'),
        ivaTarifa: texto(iva.codigoPorcentaje, '0'),
        detalles,
        pagos,
        infoAdicional,
        numeroComprobante: `${estab}-${ptoEmi}-${secuencial}`,
    };
}
