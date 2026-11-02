import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import axios from 'axios';
import { FirmaHelper } from './firma.helper';
import { FacturaSRIDto } from './sri.interface';
import { SriService } from './sri.service';

const facturaBase: FacturaSRIDto = {
    secuencial: '000000008',
    subtotal: 200,
    metodoPago: 'Efectivo',
    cliente: {
        tipoIdentificacion: '05',
        razonSocial: 'Juan Perez',
        identificacion: '1710034065',
        direccion: 'Quito',
        email: 'juan@example.com',
    },
    items: [{
        codigoPrincipal: 'P-001',
        descripcion: 'Traje de lino',
        cantidad: 1,
        precioUnitario: 200,
        descuento: 0,
    }],
};

const xmlFirmado = '<?xml version="1.0"?><factura id="comprobante">firmada</factura>';
const comprobanteAutorizado = '<?xml version="1.0"?><factura id="comprobante">autorizada</factura>';

describe('SriService', () => {
    let service: SriService;
    let configGet: jest.Mock;
    let axiosPost: jest.SpyInstance;
    let firmarXml: jest.SpyInstance;

    beforeEach(async () => {
        configGet = jest.fn((clave: string) => {
            if (clave === 'SRI_ENVIRONMENT') return 'pruebas';
            if (clave === 'SRI_CERT_PASSWORD') return 'clave-test';
            return undefined;
        });

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SriService,
                { provide: ConfigService, useValue: { get: configGet } },
            ],
        }).compile();

        service = module.get(SriService);
        axiosPost = jest.spyOn(axios, 'post');
        firmarXml = jest.spyOn(FirmaHelper, 'firmarXML').mockResolvedValue(xmlFirmado);
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    async function procesar(datos: FacturaSRIDto = facturaBase) {
        const promesa = service.procesarFacturaElectronica(datos);
        await jest.advanceTimersByTimeAsync(2500);
        return promesa;
    }

    it('falla si falta SRI_ENVIRONMENT y no llama al SRI', async () => {
        configGet.mockImplementation(() => undefined);
        await expect(service.procesarFacturaElectronica(facturaBase))
            .rejects.toBeInstanceOf(InternalServerErrorException);
        expect(axiosPost).not.toHaveBeenCalled();
        expect(firmarXml).not.toHaveBeenCalled();
    });

    it('arma la clave con fecha de Ecuador y firma sin pegarle a producción', async () => {
        jest.setSystemTime(new Date('2026-03-15T03:30:00.000Z'));
        axiosPost
            .mockResolvedValueOnce({ data: '<estado>RECIBIDA</estado>' })
            .mockResolvedValueOnce({
                data: `<estado>AUTORIZADO</estado><comprobante><![CDATA[${comprobanteAutorizado}]]></comprobante>`,
            });

        const resultado = await procesar();

        expect(resultado.exito).toBe(true);
        expect(resultado.estado).toBe('AUTORIZADO');
        expect(resultado.claveAcceso).toHaveLength(49);
        expect(resultado.claveAcceso.startsWith('14032026')).toBe(true);
        expect(resultado.claveAcceso.charAt(23)).toBe('1'); // ambiente pruebas
        expect(resultado.xmlAutorizado).toBe(comprobanteAutorizado);
        expect(firmarXml).toHaveBeenCalled();
        expect(axiosPost).toHaveBeenNthCalledWith(
            1,
            expect.stringContaining('celcer.sri.gob.ec'),
            expect.any(String),
            expect.any(Object),
        );
        expect(axiosPost.mock.calls.every(([url]) => !String(url).includes('://cel.sri.gob.ec/'))).toBe(true);
    });

    it('en reintento reutiliza clave y XML firmado sin volver a firmar', async () => {
        const clave = '2'.repeat(49);
        axiosPost
            .mockResolvedValueOnce({ data: '<estado>RECIBIDA</estado>' })
            .mockResolvedValueOnce({
                data: `<estado>AUTORIZADO</estado><comprobante><![CDATA[${comprobanteAutorizado}]]></comprobante>`,
            });

        const resultado = await procesar({
            ...facturaBase,
            claveAcceso: clave,
            xmlFirmado,
        });

        expect(resultado.claveAcceso).toBe(clave);
        expect(resultado.xmlFirmado).toBe(xmlFirmado);
        expect(firmarXml).not.toHaveBeenCalled();
        expect(axiosPost).toHaveBeenCalledTimes(2);
    });

    it('devuelve DEVUELTA si la recepción rechaza el comprobante', async () => {
        axiosPost.mockResolvedValueOnce({ data: '<estado>DEVUELTA</estado>' });

        const resultado = await procesar();

        expect(resultado).toMatchObject({
            exito: false,
            estado: 'DEVUELTA',
            xmlAutorizado: null,
        });
        expect(resultado.claveAcceso).toHaveLength(49);
        expect(axiosPost).toHaveBeenCalledTimes(1);
    });

    it('devuelve ERROR_CONEXION con clave y XML firmado si cae el SOAP', async () => {
        axiosPost.mockRejectedValueOnce(new Error('timeout'));

        const resultado = await procesar();

        expect(resultado).toMatchObject({
            exito: false,
            estado: 'ERROR_CONEXION',
            xmlFirmado,
            xmlAutorizado: null,
        });
        expect(resultado.claveAcceso).toHaveLength(49);
    });
});
