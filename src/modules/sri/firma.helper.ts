import * as forge from 'node-forge';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Crypto } from '@peculiar/webcrypto';
import * as xadesjs from 'xadesjs';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

// Inyectar el motor DOM globalmente para que xadesjs y xml-core lo detecten
(global as any).DOMParser = DOMParser;
(global as any).XMLSerializer = XMLSerializer;

// Inicializar el motor criptográfico global para Node.js
const crypto = new Crypto();
xadesjs.Application.setEngine('NodeJS', crypto);

export class FirmaHelper {

    public static async firmarXML(xmlCrudo: string, p12Password: string): Promise<string> {
        try {
            let certPath = path.resolve(process.cwd(), 'src/config/certs/firma.p12');

            if (!fs.existsSync(certPath) && process.env.SRI_CERT_BASE64) {
                certPath = path.join(os.tmpdir(), 'firma.p12');
                
                if (!fs.existsSync(certPath)) {
                    const certBuffer = Buffer.from(process.env.SRI_CERT_BASE64, 'base64');
                    fs.writeFileSync(certPath, certBuffer);
                }
            }

            // 3. Verificación final de seguridad
            if (!fs.existsSync(certPath)) {
                throw new Error(`No se encontró el archivo de firma electrónica en la ruta local ni en las variables de entorno.`);
            }

            // Leer y parsear el archivo .p12
            const p12Der = fs.readFileSync(certPath).toString('binary');
            const p12Asn1 = forge.asn1.fromDer(p12Der);
            const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, p12Password);

            // Extraer Clave Privada y Certificado
            let privateKeyForge: forge.pki.PrivateKey | null = null;
            let certificateForge: forge.pki.Certificate | null = null;
            let certBags: any[] = [];

            for (const safeContents of p12.safeContents) {
                for (const safeBag of safeContents.safeBags) {
                    if (safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag) {
                        privateKeyForge = safeBag.key as forge.pki.PrivateKey;
                    } else if (safeBag.type === forge.pki.oids.certBag) {
                        certBags.push(safeBag.cert);
                    }
                }
            }

            if (certBags.length > 0) {
                certificateForge = certBags[0] as forge.pki.Certificate;
            }

            if (!privateKeyForge || !certificateForge) {
                throw new Error('No se pudo extraer la llave privada o el certificado del archivo .p12.');
            }

            // Convertir las claves al formato WebCrypto requerido (PKCS#8)
            const rsaPrivateKeyAsn1 = forge.pki.privateKeyToAsn1(privateKeyForge);
            const privateKeyInfo = forge.pki.wrapRsaPrivateKey(rsaPrivateKeyAsn1);
            const privateKeyPem = forge.pki.privateKeyInfoToPem(privateKeyInfo);

            const certificatePem = forge.pki.certificateToPem(certificateForge);

            // Limpiar PEM a Base64 puro para X.509
            const certBase64 = certificatePem
                .replace(/-----BEGIN CERTIFICATE-----/g, '')
                .replace(/-----END CERTIFICATE-----/g, '')
                .replace(/\s+/g, '');

            // Importar clave privada a WebCrypto
            const keyData = this.pemToArrayBuffer(privateKeyPem);
            const privateKeyWebCrypto = await crypto.subtle.importKey(
                'pkcs8',
                keyData,
                { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
                true,
                ['sign']
            );

            // Configurar el documento XML usando el DOMParser inyectado
            const xmlDocument = new DOMParser().parseFromString(xmlCrudo, 'application/xml');

            const rootElement = xmlDocument.documentElement;
            if (rootElement && (rootElement as any).setIdAttribute) {
                (rootElement as any).setIdAttribute('id', true);
            }

            // Configurar la firma XAdES-BES
            const signedXml = new xadesjs.SignedXml(xmlDocument as any);

            // Generar la firma criptográfica
            const signature = await signedXml.Sign(
                { name: 'RSASSA-PKCS1-v1_5' },
                privateKeyWebCrypto,
                xmlDocument as any,
                {
                    x509: [certBase64],
                    references: [
                        {
                            hash: 'SHA-256',
                            transforms: ['enveloped', 'c14n'], 
                            uri: '#comprobante'
                        }
                    ],
                    signingCertificate: certBase64
                }
            );

            // Adherir la firma generada al XML original
            if (!xmlDocument.documentElement) {
                throw new Error('El documento XML parseado carece de un elemento raíz válido.');
            }

            const signatureXml = signature.GetXml();
            if (!signatureXml) {
                throw new Error('Fallo al generar el nodo de la firma criptográfica.');
            }

            xmlDocument.documentElement.appendChild(signatureXml as any);

            // Convertir el documento DOM a string
            let xmlFirmadoFinal = new XMLSerializer().serializeToString(xmlDocument);

            if (!xmlFirmadoFinal.startsWith('<?xml')) {
                xmlFirmadoFinal = '<?xml version="1.0" encoding="UTF-8"?>\n' + xmlFirmadoFinal;
            }

            return xmlFirmadoFinal;

        } catch (error: any) {
            console.error('Error al firmar el documento:', error);
            throw new Error(`Fallo en el proceso de firma XAdES-BES: ${error.message}`);
        }
    }

    private static pemToArrayBuffer(pem: string): ArrayBuffer {
        const b64Lines = pem.replace(/-----BEGIN [A-Z ]+-----/, '').replace(/-----END [A-Z ]+-----/, '');
        const b64 = b64Lines.replace(/\s+/g, '');
        const byteStr = Buffer.from(b64, 'base64').toString('binary');
        const bytes = new Uint8Array(byteStr.length);
        for (let i = 0; i < byteStr.length; i++) {
            bytes[i] = byteStr.charCodeAt(i);
        }
        return bytes.buffer;
    }
}