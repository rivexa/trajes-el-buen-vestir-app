import PDFDocument from 'pdfkit';
import { RideModelo } from './ride.modelo';

function moneda(valor: string): string {
    const n = Number(valor);
    return Number.isFinite(n) ? n.toFixed(2) : valor;
}

export function generarRidePdf(ride: RideModelo): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const izquierda = 40;
        const ancho = 515;

        doc.fontSize(14).font('Helvetica-Bold').text(ride.nombreComercial, { align: 'center' });
        doc.moveDown(0.2);
        doc.fontSize(9).font('Helvetica').text(ride.razonSocial, { align: 'center' });
        doc.text(`RUC: ${ride.ruc}`, { align: 'center' });
        doc.text(ride.dirMatriz, { align: 'center' });
        doc.moveDown(0.6);

        doc.font('Helvetica-Bold').fontSize(12).text('FACTURA', { align: 'center' });
        doc.font('Helvetica').fontSize(10);
        doc.text(`No. ${ride.numeroComprobante}`, { align: 'center' });
        doc.text(`Ambiente: ${ride.ambiente}   Emisión: ${ride.tipoEmision}`, { align: 'center' });
        doc.moveDown(0.4);

        doc.font('Helvetica-Bold').text('Número de autorización / Clave de acceso');
        doc.font('Helvetica').fontSize(9).text(ride.claveAcceso, { width: ancho });
        doc.moveDown(0.3);
        doc.fontSize(10).text(`Fecha de emisión: ${ride.fechaEmision}`);
        doc.text(`Dir. establecimiento: ${ride.dirEstablecimiento}`);
        doc.moveDown(0.5);

        doc.font('Helvetica-Bold').text('Cliente');
        doc.font('Helvetica');
        doc.text(`Razón social: ${ride.razonSocialComprador}`);
        doc.text(`Identificación (${ride.tipoIdentificacionComprador}): ${ride.identificacionComprador}`);
        doc.moveDown(0.5);

        const inicioTabla = doc.y;
        doc.font('Helvetica-Bold').fontSize(8);
        doc.text('Código', izquierda, inicioTabla, { width: 55 });
        doc.text('Descripción', izquierda + 55, inicioTabla, { width: 180 });
        doc.text('Cant.', izquierda + 235, inicioTabla, { width: 40, align: 'right' });
        doc.text('P. Unit.', izquierda + 280, inicioTabla, { width: 55, align: 'right' });
        doc.text('Desc.', izquierda + 340, inicioTabla, { width: 50, align: 'right' });
        doc.text('Total', izquierda + 400, inicioTabla, { width: 70, align: 'right' });
        doc.moveTo(izquierda, inicioTabla + 12).lineTo(izquierda + ancho, inicioTabla + 12).stroke();
        doc.moveDown(0.8);

        doc.font('Helvetica').fontSize(8);
        for (const detalle of ride.detalles) {
            const y = doc.y;
            doc.text(detalle.codigoPrincipal, izquierda, y, { width: 55 });
            doc.text(detalle.descripcion, izquierda + 55, y, { width: 180 });
            doc.text(detalle.cantidad, izquierda + 235, y, { width: 40, align: 'right' });
            doc.text(moneda(detalle.precioUnitario), izquierda + 280, y, { width: 55, align: 'right' });
            doc.text(moneda(detalle.descuento), izquierda + 340, y, { width: 50, align: 'right' });
            doc.text(moneda(detalle.precioTotalSinImpuesto), izquierda + 400, y, { width: 70, align: 'right' });
            doc.moveDown(1.1);
        }

        doc.moveDown(0.4);
        doc.fontSize(10);
        doc.text(`Subtotal sin impuestos: ${moneda(ride.totalSinImpuestos)}`, { align: 'right' });
        doc.text(`Descuento: ${moneda(ride.totalDescuento)}`, { align: 'right' });
        doc.text(`IVA (${ride.ivaTarifa}%): ${moneda(ride.ivaValor)}`, { align: 'right' });
        doc.font('Helvetica-Bold').text(`VALOR TOTAL: ${moneda(ride.importeTotal)} ${ride.moneda}`, { align: 'right' });
        doc.moveDown(0.6);

        if (ride.pagos.length > 0) {
            doc.font('Helvetica-Bold').text('Forma de pago');
            doc.font('Helvetica');
            for (const pago of ride.pagos) {
                doc.text(`${pago.formaPago}: ${moneda(pago.total)}`);
            }
            doc.moveDown(0.4);
        }

        if (ride.infoAdicional.length > 0) {
            doc.font('Helvetica-Bold').text('Información adicional');
            doc.font('Helvetica');
            for (const campo of ride.infoAdicional) {
                doc.text(`${campo.nombre}: ${campo.valor}`);
            }
        }

        doc.moveDown(1);
        doc.fontSize(8).fillColor('#555555')
            .text('RIDE generado a partir del comprobante electrónico autorizado. El documento tributario válido es el XML firmado.', {
                align: 'center',
                width: ancho,
            });

        doc.end();
    });
}
