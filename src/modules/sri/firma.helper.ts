import * as forge from 'node-forge';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Crypto } from '@peculiar/webcrypto';
import * as xadesjs from 'xadesjs';
import {
    DOMParser,
    XMLSerializer,
    type Document as XmldomDocument,
    type Element as XmldomElement,
    type Node as XmldomNode,
} from '@xmldom/xmldom';

(global as any).DOMParser = DOMParser;
(global as any).XMLSerializer = XMLSerializer;

const crypto = new Crypto();
xadesjs.Application.setEngine('NodeJS', crypto);

const ALGORITMO_FIRMA = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' } as const;
const HASH_REFERENCIA = 'SHA-1';

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

            if (!fs.existsSync(certPath)) {
                throw new Error(`No se encontró el archivo de firma electrónica en la ruta local ni en las variables de entorno.`);
            }

            const p12Der = fs.readFileSync(certPath).toString('binary');
            const p12Asn1 = forge.asn1.fromDer(p12Der);
            const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, p12Password);

            let privateKeyForge: forge.pki.rsa.PrivateKey | null = null;
            const certificados: forge.pki.Certificate[] = [];

            for (const safeContents of p12.safeContents) {
                for (const safeBag of safeContents.safeBags) {
                    if (safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag && safeBag.key) {
                        privateKeyForge = safeBag.key as forge.pki.rsa.PrivateKey;
                    } else if (safeBag.type === forge.pki.oids.certBag && safeBag.cert) {
                        certificados.push(safeBag.cert);
                    }
                }
            }

            if (!privateKeyForge) {
                throw new Error('No se pudo extraer la llave privada del archivo .p12.');
            }

            const certificateForge = certificados.find((cert) =>
                this.certificadoCoincideConLlave(cert, privateKeyForge!),
            );

            if (!certificateForge) {
                throw new Error('No se encontró un certificado que coincida con la llave privada del .p12.');
            }

            const rsaPrivateKeyAsn1 = forge.pki.privateKeyToAsn1(privateKeyForge);
            const privateKeyInfo = forge.pki.wrapRsaPrivateKey(rsaPrivateKeyAsn1);
            const privateKeyPem = forge.pki.privateKeyInfoToPem(privateKeyInfo);
            const certificatePem = forge.pki.certificateToPem(certificateForge);

            const certBase64 = certificatePem
                .replace(/-----BEGIN CERTIFICATE-----/g, '')
                .replace(/-----END CERTIFICATE-----/g, '')
                .replace(/\s+/g, '');

            const keyData = this.pemToArrayBuffer(privateKeyPem);
            const privateKeyWebCrypto = await crypto.subtle.importKey(
                'pkcs8',
                keyData,
                ALGORITMO_FIRMA,
                true,
                ['sign'],
            );

            const xmlDocument = new DOMParser().parseFromString(xmlCrudo, 'application/xml');
            this.habilitarBusquedaPorId(xmlDocument);

            const signedXml = new xadesjs.SignedXml(xmlDocument as any);
            const signature = await signedXml.Sign(
                { name: 'RSASSA-PKCS1-v1_5' },
                privateKeyWebCrypto,
                xmlDocument as any,
                {
                    x509: [certBase64],
                    references: [
                        {
                            hash: HASH_REFERENCIA,
                            transforms: ['enveloped', 'c14n'],
                            uri: '#comprobante',
                        },
                    ],
                    signingCertificate: certBase64,
                },
            );

            if (!xmlDocument.documentElement) {
                throw new Error('El documento XML parseado carece de un elemento raíz válido.');
            }

            const signatureXml = signature.GetXml();
            if (!signatureXml) {
                throw new Error('Fallo al generar el nodo de la firma criptográfica.');
            }

            xmlDocument.documentElement.appendChild(signatureXml as any);

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

    private static certificadoCoincideConLlave(
        certificado: forge.pki.Certificate,
        llavePrivada: forge.pki.rsa.PrivateKey,
    ): boolean {
        const publica = certificado.publicKey as forge.pki.rsa.PublicKey;
        return publica.n.compareTo(llavePrivada.n) === 0
            && publica.e.compareTo(llavePrivada.e) === 0;
    }

    /** @xmldom/xmldom no implementa setIdAttribute; xadesjs resuelve #comprobante vía getElementById. */
    private static habilitarBusquedaPorId(documento: XmldomDocument): void {
        (documento as XmldomDocument & {
            getElementById: (id: string) => XmldomElement | null;
        }).getElementById = (idBuscado: string) => {
            const recorrer = (nodo: XmldomNode): XmldomElement | null => {
                if (nodo.nodeType === 1) {
                    const elemento = nodo as XmldomElement;
                    const id = elemento.getAttribute('id') ?? elemento.getAttribute('Id');
                    if (id === idBuscado) {
                        return elemento;
                    }
                }
                const hijos = nodo.childNodes;
                for (let i = 0; i < hijos.length; i++) {
                    const hijo = hijos.item(i);
                    if (!hijo) continue;
                    const encontrado = recorrer(hijo);
                    if (encontrado) {
                        return encontrado;
                    }
                }
                return null;
            };
            return recorrer(documento);
        };
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
