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

            await new Promise((resolve) => setTimeout(resolve, 2000));
            const respuestaAutorizacion = await this.solicitarAutorizacionSRI(claveAccesoOficial, ambiente);
            const autorizacion = estadoAutorizacionSri(respuestaAutorizacion);

            if (autorizacion === 'AUTORIZADO') {
                const comprobante = extraerComprobanteAutorizado(respuestaAutorizacion);
                return {
                    exito: true,
                    estado: 'AUTORIZADO',
                    claveAcceso: claveAccesoOficial,
                    xmlFirmado,
                    xmlAutorizado: comprobante ?? xmlFirmado,
                    mensaje: 'Autorizado',
                };
            }

            if (autorizacion === 'PENDIENTE') {
                return {
                    exito: false,
                    estado: 'PENDIENTE',
                    claveAcceso: claveAccesoOficial,
                    xmlFirmado,
                    xmlAutorizado: null,
                    mensaje: 'Comprobante recibido; autorización pendiente en el SRI.',
                };
            }

            return {
                exito: false,
                estado: 'RECHAZADO',
                claveAcceso: claveAccesoOficial,
                xmlFirmado,
                xmlAutorizado: null,
                mensaje: 'Rechazado por validaciones del SRI.',
            };
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
}
