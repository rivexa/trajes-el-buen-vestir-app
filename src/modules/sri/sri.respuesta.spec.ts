import {
    codigoFormaPago,
    codigoNumericoDesdeClave,
    esXmlComprobanteFactura,
    estadoAutorizacionSri,
    estadoRecepcionSri,
    extraerComprobanteAutorizado,
    fechaDesdeClave,
} from './sri.respuesta';

describe('sri.respuesta', () => {
    it('detecta recepción RECIBIDA y DEVUELTA', () => {
        expect(estadoRecepcionSri('<estado>RECIBIDA</estado>')).toBe('RECIBIDA');
        expect(estadoRecepcionSri('<estado>DEVUELTA</estado>')).toBe('DEVUELTA');
        expect(estadoRecepcionSri('<estado>OTRO</estado>')).toBe('DESCONOCIDO');
    });

    it('detecta autorización AUTORIZADO, NO AUTORIZADO y PENDIENTE', () => {
        expect(estadoAutorizacionSri('<estado>AUTORIZADO</estado>')).toBe('AUTORIZADO');
        expect(estadoAutorizacionSri('<estado>NO AUTORIZADO</estado>')).toBe('NO AUTORIZADO');
        expect(estadoAutorizacionSri('<estado>PENDIENTE</estado>')).toBe('PENDIENTE');
    });

    it('extrae el comprobante del CDATA y no el sobre SOAP', () => {
        const soap = `
          <autorizacion>
            <estado>AUTORIZADO</estado>
            <comprobante><![CDATA[<?xml version="1.0"?><factura id="comprobante"></factura>]]></comprobante>
          </autorizacion>`;
        expect(extraerComprobanteAutorizado(soap)).toBe(
            '<?xml version="1.0"?><factura id="comprobante"></factura>',
        );
        expect(esXmlComprobanteFactura(extraerComprobanteAutorizado(soap))).toBe(true);
        expect(esXmlComprobanteFactura('<soapenv:Envelope><factura/></soapenv:Envelope>')).toBe(false);
    });

    it('lee fecha y código numérico desde la clave de acceso', () => {
        const clave = `${'01032026'}01${'1753329182001'}1${'001'}${'001'}${'000000008'}${'87654321'}1`;
        const conDigito = `${clave}0`;
        expect(conDigito).toHaveLength(49);
        expect(fechaDesdeClave(conDigito)).toEqual({
            dia: '01',
            mes: '03',
            anio: '2026',
            fechaEmision: '01/03/2026',
        });
        expect(codigoNumericoDesdeClave(conDigito)).toBe('87654321');
    });

    it('mapea métodos de pago a códigos SRI', () => {
        expect(codigoFormaPago('Efectivo')).toBe('01');
        expect(codigoFormaPago('Tarjeta de crédito')).toBe('19');
        expect(codigoFormaPago('Transferencia')).toBe('20');
    });
});
