import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Builder } from 'xml2js';
import axios from 'axios';
import { FirmaHelper } from './firma.helper';
import { FacturaSRIDto, ResultadoSri } from './sri.interface';
import {
    codigoAmbienteSri,
    resolverAmbienteSri,
    urlAutorizacionSri,
    urlRecepcionSri,
    type AmbienteSri,
} from './sri.ambiente';
import { fechaEmisionEcuador } from './sri.fecha';
import {
    SRI_AUTH_ESPERA_ENTRE_MS,
    SRI_AUTH_ESPERA_INICIAL_MS,
    SRI_AUTH_INTENTOS_CONSULTA,
    SRI_AUTH_INTENTOS_EMISION,
} from './sri.autorizacion';
import {
    codigoFormaPago,
    codigoNumericoAleatorio,
    codigoNumericoDesdeClave,
    estadoAutorizacionSri,
    estadoRecepcionSri,
    extraerComprobanteAutorizado,
    fechaDesdeClave,
} from './sri.respuesta';

@Injectable()
export class SriService {
    constructor(private configService: ConfigService) { }

    private esperar(ms: number) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    private ambienteConfigurado(): AmbienteSri {
        try {
            return resolverAmbienteSri(this.configService.get<string>('SRI_ENVIRONMENT'));
        } catch (error: any) {
            throw new InternalServerErrorException(error.message);
        }
    }

    private calcularDigitoVerificador(clave48: string): string {
        let suma = 0;
        let factor = 2;
        for (let i = clave48.length - 1; i >= 0; i--) {
            suma += parseInt(clave48.charAt(i), 10) * factor;
            factor = factor === 7 ? 2 : factor + 1;
        }
        const modulo = suma % 11;
        const digito = 11 - modulo;
        if (digito === 11) return '0';
        if (digito === 10) return '1';
        return digito.toString();
    }

    private async transmitirAlSRI(xmlFirmado: string, ambiente: AmbienteSri) {
        const soapEnvelope = `
            <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.recepcion">
                <soapenv:Header/>
                <soapenv:Body><ec:validarComprobante><xml>${Buffer.from(xmlFirmado).toString('base64')}</xml></ec:validarComprobante></soapenv:Body>
            </soapenv:Envelope>`;

        const respuesta = await axios.post(urlRecepcionSri(ambiente), soapEnvelope, {
            headers: { 'Content-Type': 'text/xml;charset=UTF-8' },
        });
        return String(respuesta.data);
    }

    private async solicitarAutorizacionSRI(claveAcceso: string, ambiente: AmbienteSri) {
        const soapEnvelope = `
            <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.autorizacion">
                <soapenv:Header/>
                <soapenv:Body><ec:autorizacionComprobante><claveAccesoComprobante>${claveAcceso}</claveAccesoComprobante></ec:autorizacionComprobante></soapenv:Body>
            </soapenv:Envelope>`;

        const respuesta = await axios.post(urlAutorizacionSri(ambiente), soapEnvelope, {
            headers: { 'Content-Type': 'text/xml;charset=UTF-8' },
        });
        return String(respuesta.data);
    }

    private construirXmlCrudo(
        datos: FacturaSRIDto,
        ambienteSRI: '1' | '2',
        claveAccesoOficial: string,
        fechaEmision: string,
    ): string {
        const rucEmisor = '1753329182001';
        const tipoEmision = '1';
        const tipoComprobante = '01';
        const estab = '001';
        const ptoEmi = '001';
        const formaPago = codigoFormaPago(datos.metodoPago);
        const total = datos.subtotal.toFixed(2);
        const correo = datos.cliente.email?.trim() || 'sin-correo@cliente.local';

        const facturaJson = {
            factura: {
                $: { id: 'comprobante', version: '1.1.0' },
                infoTributaria: {
                    ambiente: ambienteSRI,
                    tipoEmision,
                    razonSocial: 'SARMIENTO CAILLAGUA NESTOR DAVID',
                    nombreComercial: 'Trajes El Buen Vestir',
                    ruc: rucEmisor,
                    claveAcceso: claveAccesoOficial,
                    codDoc: tipoComprobante,
                    estab,
                    ptoEmi,
                    secuencial: datos.secuencial,
                    dirMatriz: 'Quito, Ecuador',
                },
                infoFactura: {
                    fechaEmision,
                    dirEstablecimiento: 'Quito, Ecuador',
                    obligadoContabilidad: 'NO',
                    tipoIdentificacionComprador: datos.cliente.tipoIdentificacion,
                    razonSocialComprador: datos.cliente.razonSocial,
                    identificacionComprador: datos.cliente.identificacion,
                    totalSinImpuestos: total,
                    totalDescuento: '0.00',
                    totalConImpuestos: {
                        totalImpuesto: [{
                            codigo: '2',
                            codigoPorcentaje: '0',
                            baseImponible: total,
                            valor: '0.00',
                        }],
                    },
                    propina: '0.00',
                    importeTotal: total,
                    moneda: 'DOLAR',
                    pagos: {
                        pago: [{
                            formaPago,
                            total,
                            plazo: '0',
                            unidadTiempo: 'dias',
                        }],
                    },
                },
                detalles: {
                    detalle: datos.items.map((item) => {
                        const precioTotal = (item.cantidad * item.precioUnitario - item.descuento).toFixed(2);
                        return {
                            codigoPrincipal: item.codigoPrincipal,
                            descripcion: item.descripcion,
                            cantidad: item.cantidad.toFixed(2),
                            precioUnitario: item.precioUnitario.toFixed(2),
                            descuento: item.descuento.toFixed(2),
                            precioTotalSinImpuesto: precioTotal,
                            impuestos: {
                                impuesto: [{
                                    codigo: '2',
                                    codigoPorcentaje: '0',
                                    tarifa: '0.00',
                                    baseImponible: precioTotal,
                                    valor: '0.00',
                                }],
                            },
                        };
                    }),
                },
                infoAdicional: {
                    campoAdicional: [
                        { $: { nombre: 'Email' }, _: correo },
                        { $: { nombre: 'Direccion' }, _: datos.cliente.direccion || 'Quito, Ecuador' },
                    ],
                },
            },
        };

        const builder = new Builder({ xmldec: { version: '1.0', encoding: 'UTF-8' } });
        return builder.buildObject(facturaJson);
    }

    public async procesarFacturaElectronica(datos: FacturaSRIDto): Promise<ResultadoSri> {
        const ambiente = this.ambienteConfigurado();
        const ambienteSRI = codigoAmbienteSri(ambiente);
        const rucEmisor = '1753329182001';
        const tipoEmision = '1';
        const tipoComprobante = '01';
        const estab = '001';
        const ptoEmi = '001';

        let claveAccesoOficial = datos.claveAcceso?.trim() || '';
        let xmlFirmado = datos.xmlFirmado?.trim() || '';

        if (!xmlFirmado) {
            const fechaClave = claveAccesoOficial ? fechaDesdeClave(claveAccesoOficial) : null;
            const { dia, mes, anio, fechaEmision } = fechaClave ?? fechaEmisionEcuador();
            const codigoNumerico = (claveAccesoOficial && codigoNumericoDesdeClave(claveAccesoOficial))
                || codigoNumericoAleatorio();

            if (!claveAccesoOficial) {
                const clave48 = `${dia}${mes}${anio}${tipoComprobante}${rucEmisor}${ambienteSRI}${estab}${ptoEmi}${datos.secuencial}${codigoNumerico}${tipoEmision}`;
                claveAccesoOficial = `${clave48}${this.calcularDigitoVerificador(clave48)}`;
            }

            const xmlCrudo = this.construirXmlCrudo(datos, ambienteSRI, claveAccesoOficial, fechaEmision);
            const passwordFirma = this.configService.get<string>('SRI_CERT_PASSWORD');
            xmlFirmado = await FirmaHelper.firmarXML(xmlCrudo, passwordFirma!);
        }

        try {
            const respuestaRecepcion = await this.transmitirAlSRI(xmlFirmado, ambiente);
            const recepcion = estadoRecepcionSri(respuestaRecepcion);

            if (recepcion === 'DEVUELTA') {
                return {
                    exito: false,
                    estado: 'DEVUELTA',
                    claveAcceso: claveAccesoOficial,
                    xmlFirmado,
                    xmlAutorizado: null,
                    mensaje: 'El SRI devolvió el comprobante en recepción.',
                };
            }

            return this.consultarAutorizacionConReintentos({
                claveAcceso: claveAccesoOficial,
                xmlFirmado,
                ambiente,
                intentos: SRI_AUTH_INTENTOS_EMISION,
                esperaInicialMs: SRI_AUTH_ESPERA_INICIAL_MS,
            });
        } catch {
            return {
                exito: false,
                estado: 'ERROR_CONEXION',
                claveAcceso: claveAccesoOficial,
                xmlFirmado,
                xmlAutorizado: null,
                mensaje: 'Fallo al comunicar con el SRI.',
            };
        }
    }

    /**
     * Solo consulta autorización (sin reenviar recepción).
     * Para facturas ya en PROCESANDO con clave de acceso.
     */
    public async consultarAutorizacion(params: {
        claveAcceso: string;
        xmlFirmado?: string | null;
        intentos?: number;
    }): Promise<ResultadoSri> {
        const ambiente = this.ambienteConfigurado();
        const claveAcceso = params.claveAcceso.trim();
        const xmlFirmado = params.xmlFirmado?.trim() || '';

        if (!claveAcceso) {
            return {
                exito: false,
                estado: 'ERROR_CONEXION',
                claveAcceso: '',
                xmlFirmado,
                xmlAutorizado: null,
                mensaje: 'La factura no tiene clave de acceso para consultar al SRI.',
            };
        }

        return this.consultarAutorizacionConReintentos({
            claveAcceso,
            xmlFirmado,
            ambiente,
            intentos: params.intentos ?? SRI_AUTH_INTENTOS_CONSULTA,
            esperaInicialMs: 0,
        });
    }

    private async consultarAutorizacionConReintentos(params: {
        claveAcceso: string;
        xmlFirmado: string;
        ambiente: AmbienteSri;
        intentos: number;
        esperaInicialMs: number;
    }): Promise<ResultadoSri> {
        const { claveAcceso, xmlFirmado, ambiente, intentos, esperaInicialMs } = params;

        if (esperaInicialMs > 0) {
            await this.esperar(esperaInicialMs);
        }

        let ultimoErrorConexion = false;

        for (let intento = 0; intento < intentos; intento++) {
            try {
                const respuestaAutorizacion = await this.solicitarAutorizacionSRI(claveAcceso, ambiente);
                const autorizacion = estadoAutorizacionSri(respuestaAutorizacion);
                ultimoErrorConexion = false;

                if (autorizacion === 'AUTORIZADO') {
                    const comprobante = extraerComprobanteAutorizado(respuestaAutorizacion);
                    return {
                        exito: true,
                        estado: 'AUTORIZADO',
                        claveAcceso,
                        xmlFirmado,
                        xmlAutorizado: comprobante ?? (xmlFirmado || null),
                        mensaje: 'Autorizado',
                    };
                }

                if (autorizacion === 'PENDIENTE') {
                    if (intento < intentos - 1) {
                        await this.esperar(SRI_AUTH_ESPERA_ENTRE_MS);
                    }
                    continue;
                }

                return {
                    exito: false,
                    estado: 'RECHAZADO',
                    claveAcceso,
                    xmlFirmado,
                    xmlAutorizado: null,
                    mensaje: 'Rechazado por validaciones del SRI.',
                };
            } catch {
                ultimoErrorConexion = true;
                if (intento < intentos - 1) {
                    await this.esperar(SRI_AUTH_ESPERA_ENTRE_MS);
                }
            }
        }

        if (ultimoErrorConexion) {
            return {
                exito: false,
                estado: 'ERROR_CONEXION',
                claveAcceso,
                xmlFirmado,
                xmlAutorizado: null,
                mensaje: 'Fallo al consultar autorización en el SRI.',
            };
        }

        return {
            exito: false,
            estado: 'PENDIENTE',
            claveAcceso,
            xmlFirmado,
            xmlAutorizado: null,
            mensaje: 'Comprobante recibido; autorización pendiente en el SRI.',
        };
    }
}
