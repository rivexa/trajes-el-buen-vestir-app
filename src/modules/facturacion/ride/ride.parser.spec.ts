import { parsearRideDesdeXml } from './ride.parser';
import { generarRidePdf } from './ride.pdf';

const xmlFactura = `<?xml version="1.0" encoding="UTF-8"?>
<factura id="comprobante" version="1.1.0">
  <infoTributaria>
    <ambiente>1</ambiente>
    <tipoEmision>1</tipoEmision>
    <razonSocial>SARMIENTO CAILLAGUA NESTOR DAVID</razonSocial>
    <nombreComercial>Trajes El Buen Vestir</nombreComercial>
    <ruc>1753329182001</ruc>
    <claveAcceso>1234567890123456789012345678901234567890123456789</claveAcceso>
    <codDoc>01</codDoc>
    <estab>001</estab>
    <ptoEmi>001</ptoEmi>
    <secuencial>000000008</secuencial>
    <dirMatriz>Quito, Ecuador</dirMatriz>
  </infoTributaria>
  <infoFactura>
    <fechaEmision>02/11/2026</fechaEmision>
    <dirEstablecimiento>Quito, Ecuador</dirEstablecimiento>
    <tipoIdentificacionComprador>05</tipoIdentificacionComprador>
    <razonSocialComprador>Juan Perez</razonSocialComprador>
    <identificacionComprador>1710034065</identificacionComprador>
    <totalSinImpuestos>200.00</totalSinImpuestos>
    <totalDescuento>0.00</totalDescuento>
    <totalConImpuestos>
      <totalImpuesto>
        <codigo>2</codigo>
        <codigoPorcentaje>0</codigoPorcentaje>
        <baseImponible>200.00</baseImponible>
        <valor>0.00</valor>
      </totalImpuesto>
    </totalConImpuestos>
    <importeTotal>200.00</importeTotal>
    <moneda>DOLAR</moneda>
    <pagos>
      <pago>
        <formaPago>01</formaPago>
        <total>200.00</total>
      </pago>
    </pagos>
  </infoFactura>
  <detalles>
    <detalle>
      <codigoPrincipal>P-001</codigoPrincipal>
      <descripcion>Traje de lino</descripcion>
      <cantidad>1.00</cantidad>
      <precioUnitario>200.00</precioUnitario>
      <descuento>0.00</descuento>
      <precioTotalSinImpuesto>200.00</precioTotalSinImpuesto>
    </detalle>
  </detalles>
  <infoAdicional>
    <campoAdicional nombre="Email">juan@example.com</campoAdicional>
  </infoAdicional>
</factura>`;

describe('ride parser y pdf', () => {
    it('arma el modelo RIDE desde el XML autorizado', async () => {
        const ride = await parsearRideDesdeXml(xmlFactura);
        expect(ride.nombreComercial).toBe('Trajes El Buen Vestir');
        expect(ride.numeroComprobante).toBe('001-001-000000008');
        expect(ride.ambiente).toBe('PRUEBAS');
        expect(ride.razonSocialComprador).toBe('Juan Perez');
        expect(ride.detalles).toHaveLength(1);
        expect(ride.pagos[0].formaPago).toBe('Efectivo');
        expect(ride.infoAdicional[0]).toEqual({ nombre: 'Email', valor: 'juan@example.com' });
        expect(ride.ivaValor).toBe('0.00');
    });

    it('genera un PDF no vacío a partir del modelo', async () => {
        const ride = await parsearRideDesdeXml(xmlFactura);
        const pdf = await generarRidePdf(ride);
        expect(Buffer.isBuffer(pdf)).toBe(true);
        expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
        expect(pdf.length).toBeGreaterThan(500);
    });
});
