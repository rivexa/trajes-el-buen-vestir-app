import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Builder } from 'xml2js';
import axios from 'axios';
import { FirmaHelper } from './firma.helper';
import { FacturaSRIDto } from './sri.interface';
import {
    codigoAmbienteSri,
    resolverAmbienteSri,
    urlAutorizacionSri,
    urlRecepcionSri,
    type AmbienteSri,
} from './sri.ambiente';
import { fechaEmisionEcuador } from './sri.fecha';

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

        try {
            const respuesta = await axios.post(urlRecepcionSri(ambiente), soapEnvelope, {
                headers: { 'Content-Type': 'text/xml;charset=UTF-8' },
            });
            return respuesta.data;
        } catch {
            throw new InternalServerErrorException('Fallo al comunicar con Recepción SRI.');
        }
    }

    private async solicitarAutorizacionSRI(claveAcceso: string, ambiente: AmbienteSri) {
        const soapEnvelope = `
            <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.autorizacion">
                <soapenv:Header/>
                <soapenv:Body><ec:autorizacionComprobante><claveAccesoComprobante>${claveAcceso}</claveAccesoComprobante></ec:autorizacionComprobante></soapenv:Body>
            </soapenv:Envelope>`;

        try {
            const respuesta = await axios.post(urlAutorizacionSri(ambiente), soapEnvelope, {
                headers: { 'Content-Type': 'text/xml;charset=UTF-8' },
            });
            return respuesta.data;
        } catch {
            throw new InternalServerErrorException('Fallo al solicitar Autorización SRI.');
        }
    }

    public async procesarFacturaElectronica(datos: FacturaSRIDto) {
        const ambiente = this.ambienteConfigurado();
        const rucEmisor = '1753329182001';
        const ambienteSRI = codigoAmbienteSri(ambiente);
        const tipoEmision = '1';
        const tipoComprobante = '01';
        const estab = '001';
        const ptoEmi = '001';
        const codigoNumerico = '12345678';
        const { dia, mes, anio, fechaEmision } = fechaEmisionEcuador();

        const clave48 = `${dia}${mes}${anio}${tipoComprobante}${rucEmisor}${ambienteSRI}${estab}${ptoEmi}${datos.secuencial}${codigoNumerico}${tipoEmision}`;
        const claveAccesoOficial = `${clave48}${this.calcularDigitoVerificador(clave48)}`;

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
                    totalSinImpuestos: datos.subtotal.toFixed(2),
                    totalDescuento: '0.00',
                    totalConImpuestos: {
                        totalImpuesto: [{ codigo: '2', codigoPorcentaje: '0', baseImponible: datos.subtotal.toFixed(2), valor: '0.00' }]
                    },
                    propina: '0.00',
                    importeTotal: datos.subtotal.toFixed(2),
                    moneda: 'DOLAR'
                },
                detalles: {
                    detalle: datos.items.map(item => ({
                        codigoPrincipal: item.codigoPrincipal,
                        descripcion: item.descripcion,
                        cantidad: item.cantidad.toFixed(2),
                        precioUnitario: item.precioUnitario.toFixed(2),
                        descuento: item.descuento.toFixed(2),
                        precioTotalSinImpuesto: (item.cantidad * item.precioUnitario - item.descuento).toFixed(2),
                        impuestos: {
                            impuesto: [{ codigo: '2', codigoPorcentaje: '0', tarifa: '0.00', baseImponible: (item.cantidad * item.precioUnitario - item.descuento).toFixed(2), valor: '0.00' }]
                        }
                    }))
                }
            }
        };

        const builder = new Builder({ xmldec: { version: '1.0', encoding: 'UTF-8' } });
        const xmlCrudo = builder.buildObject(facturaJson);
        const passwordFirma = this.configService.get<string>('SRI_CERT_PASSWORD');
        const xmlFirmadoFinal = await FirmaHelper.firmarXML(xmlCrudo, passwordFirma!);

        await this.transmitirAlSRI(xmlFirmadoFinal, ambiente);
        await new Promise(resolve => setTimeout(resolve, 2000));

        const respuestaAutorizacion = await this.solicitarAutorizacionSRI(claveAccesoOficial, ambiente);
        const autorizada = respuestaAutorizacion.includes('<estado>AUTORIZADO</estado>');

        return {
            exito: autorizada,
            claveAcceso: claveAccesoOficial,
            xmlAutorizado: respuestaAutorizacion
        };
    }
}
