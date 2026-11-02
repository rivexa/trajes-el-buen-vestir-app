import { BadRequestException, ConflictException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SupabaseService } from '../../config/supabase.service';
import { SriService } from '../sri/sri.service';
import { FacturacionService } from './facturacion.service';

type ResultadoConsulta = {
    data?: unknown;
    count?: number | null;
    error?: { code?: string; message?: string } | null;
};

function consultaSupabase(...resultados: ResultadoConsulta[]) {
    const cola = [...resultados];
    const consulta: any = {};
    for (const metodo of ['select', 'insert', 'update', 'delete', 'eq', 'in', 'is', 'or', 'order', 'range', 'single']) {
        consulta[metodo] = jest.fn().mockReturnValue(consulta);
    }
    consulta.then = (
        resolve: (value: ResultadoConsulta) => unknown,
        reject?: (reason: unknown) => unknown,
    ) => {
        const resultado = cola.length > 0 ? cola.shift()! : { data: null, error: null };
        return Promise.resolve(resultado).then(resolve, reject);
    };
    return consulta;
}

const CLIENTE_ID = '11111111-1111-4111-8111-111111111111';
const OTRO_CLIENTE = '22222222-2222-4222-8222-222222222222';
const ORDEN_ID = '33333333-3333-4333-8333-333333333333';
const OTRA_ORDEN = '55555555-5555-4555-8555-555555555555';
const FACTURA_ID = '44444444-4444-4444-8444-444444444444';

const cliente = {
    id: CLIENTE_ID,
    nombres: 'Juan',
    apellidos: 'Pérez',
    cedula_ruc: '1710034065',
    direccion: 'Quito',
};

const detalleOrden = {
    descripcion: 'Traje de lino',
    cantidad: 1,
    precio_unitario: 200,
};

describe('FacturacionService', () => {
    let service: FacturacionService;
    let from: jest.Mock;
    const resultadoSriOk = {
        exito: true,
        estado: 'AUTORIZADO' as const,
        claveAcceso: '1'.repeat(49),
        xmlFirmado: '<factura id="comprobante">firmada</factura>',
        xmlAutorizado: '<factura id="comprobante">autorizada</factura>',
        mensaje: 'Autorizado',
    };
    const sriService = {
        procesarFacturaElectronica: jest.fn().mockResolvedValue(resultadoSriOk),
    };

    beforeEach(async () => {
        from = jest.fn();
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                FacturacionService,
                { provide: SupabaseService, useValue: { getClient: () => ({ from }) } },
                { provide: SriService, useValue: sriService },
            ],
        }).compile();

        service = module.get(FacturacionService);
        jest.clearAllMocks();
        sriService.procesarFacturaElectronica.mockResolvedValue(resultadoSriOk);
    });

    it('debe construirse con el mock de Supabase', () => {
        expect(service).toBeDefined();
    });

    it('responde 400 si la orden no es del cliente indicado', async () => {
        from.mockImplementation((tabla: string) => {
            if (tabla === 'clientes') return consultaSupabase({ data: cliente, error: null });
            return consultaSupabase({
                data: [{
                    id: ORDEN_ID,
                    cliente_id: OTRO_CLIENTE,
                    estado: 'Pendiente',
                    factura_id: null,
                    abono: 50,
                    saldo: 150,
                    subtotal: 200,
                    orden_detalles: [detalleOrden],
                }],
                error: null,
            });
        });

        await expect(service.emitirFactura({
            cliente_id: CLIENTE_ID,
            orden_id: ORDEN_ID,
        })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('toma los ítems de la orden y cancela su saldo', async () => {
        const clientes = consultaSupabase({ data: cliente, error: null });
        const ordenes = consultaSupabase(
            {
                data: [{
                    id: ORDEN_ID,
                    cliente_id: CLIENTE_ID,
                    estado: 'Pendiente',
                    factura_id: null,
                    abono: 50,
                    saldo: 150,
                    subtotal: 200,
                    orden_detalles: [detalleOrden],
                }],
                error: null,
            },
            { data: { id: ORDEN_ID }, error: null },
        );
        const facturas = consultaSupabase(
            { data: { id: FACTURA_ID, secuencial_local: 8 }, error: null },
            { data: null, error: null },
        );
        const detalles = consultaSupabase({ data: null, error: null });
        from.mockImplementation((tabla: string) => {
            if (tabla === 'clientes') return clientes;
            if (tabla === 'ordenes_pedido') return ordenes;
            if (tabla === 'factura_detalles') return detalles;
            return facturas;
        });

        await service.emitirFactura({
            cliente_id: CLIENTE_ID,
            orden_id: ORDEN_ID,
            detalles: [{ descripcion: 'Ítem inventado', cantidad: 1, precio_unitario: 1 }],
        });

        expect(detalles.insert).toHaveBeenCalledWith([expect.objectContaining({
            descripcion: 'Traje de lino',
            precio_unitario: 200,
        })]);
        expect(ordenes.update).toHaveBeenCalledWith({
            factura_id: FACTURA_ID,
            abono_antes_facturar: 50,
            saldo_antes_facturar: 150,
            abono: 200,
        });
        expect(sriService.procesarFacturaElectronica).toHaveBeenCalledWith(expect.objectContaining({
            subtotal: 200,
            items: [expect.objectContaining({ descripcion: 'Traje de lino' })],
        }));
    });

    it('suma varias órdenes y cancela el saldo de cada una', async () => {
        const clientes = consultaSupabase({ data: cliente, error: null });
        const ordenes = consultaSupabase(
            {
                data: [
                    {
                        id: ORDEN_ID,
                        cliente_id: CLIENTE_ID,
                        estado: 'Pendiente',
                        factura_id: null,
                        abono: 50,
                        saldo: 150,
                        subtotal: 200,
                        orden_detalles: [detalleOrden],
                    },
                    {
                        id: OTRA_ORDEN,
                        cliente_id: CLIENTE_ID,
                        estado: 'Pendiente',
                        factura_id: null,
                        abono: 0,
                        saldo: 80,
                        subtotal: 80,
                        orden_detalles: [{ descripcion: 'Camisa', cantidad: 1, precio_unitario: 80 }],
                    },
                ],
                error: null,
            },
            { data: { id: ORDEN_ID }, error: null },
            { data: { id: OTRA_ORDEN }, error: null },
        );
        const facturas = consultaSupabase(
            { data: { id: FACTURA_ID, secuencial_local: 8, orden_id: ORDEN_ID }, error: null },
            { data: null, error: null },
        );
        const detalles = consultaSupabase({ data: null, error: null });
        from.mockImplementation((tabla: string) => {
            if (tabla === 'clientes') return clientes;
            if (tabla === 'ordenes_pedido') return ordenes;
            if (tabla === 'factura_detalles') return detalles;
            return facturas;
        });

        await service.emitirFactura({
            cliente_id: CLIENTE_ID,
            orden_ids: [ORDEN_ID, OTRA_ORDEN],
        });

        expect(detalles.insert).toHaveBeenCalledWith([
            expect.objectContaining({ descripcion: 'Traje de lino', precio_unitario: 200 }),
            expect.objectContaining({ descripcion: 'Camisa', precio_unitario: 80 }),
        ]);
        expect(ordenes.update).toHaveBeenNthCalledWith(1, expect.objectContaining({
            factura_id: FACTURA_ID,
            abono: 200,
        }));
        expect(ordenes.update).toHaveBeenNthCalledWith(2, expect.objectContaining({
            factura_id: FACTURA_ID,
            abono: 80,
        }));
        expect(sriService.procesarFacturaElectronica).toHaveBeenCalledWith(expect.objectContaining({
            subtotal: 280,
        }));
    });

    it('revierte la cabecera si fallan los detalles', async () => {
        const clientes = consultaSupabase({ data: cliente, error: null });
        const facturas = consultaSupabase(
            { data: { id: FACTURA_ID, secuencial_local: 1 }, error: null },
            { data: null, error: null },
        );
        const detalles = consultaSupabase({
            data: null,
            error: { code: '23502', message: 'not null' },
        });
        from.mockImplementation((tabla: string) => {
            if (tabla === 'clientes') return clientes;
            if (tabla === 'factura_detalles') return detalles;
            return facturas;
        });

        await expect(service.emitirFactura({
            cliente_id: CLIENTE_ID,
            detalles: [{ descripcion: 'Traje', cantidad: 1, precio_unitario: 200 }],
        })).rejects.toBeInstanceOf(InternalServerErrorException);
        expect(facturas.delete).toHaveBeenCalled();
        expect(sriService.procesarFacturaElectronica).not.toHaveBeenCalled();
    });

    it('responde 409 si la orden ya tiene factura', async () => {
        from.mockImplementation((tabla: string) => {
            if (tabla === 'clientes') return consultaSupabase({ data: cliente, error: null });
            return consultaSupabase({
                data: [{
                    id: ORDEN_ID,
                    cliente_id: CLIENTE_ID,
                    estado: 'Pendiente',
                    factura_id: FACTURA_ID,
                    abono: 50,
                    saldo: 150,
                    subtotal: 200,
                    orden_detalles: [detalleOrden],
                }],
                error: null,
            });
        });

        await expect(service.emitirFactura({
            cliente_id: CLIENTE_ID,
            orden_id: ORDEN_ID,
        })).rejects.toBeInstanceOf(ConflictException);
    });

    it('sanitiza el search antes de interpolarlo en el filtro', async () => {
        const consulta = consultaSupabase({ data: [], count: 0, error: null });
        from.mockReturnValue(consulta);

        await service.obtenerTodas(1, 10, 'juan,nombres.eq.hack');

        expect(consulta.or).toHaveBeenCalledWith(
            'clientes.cedula_ruc.ilike.%juannombres.eq.hack%,clientes.nombres.ilike.%juannombres.eq.hack%,clientes.apellidos.ilike.%juannombres.eq.hack%',
        );
    });

    it('no aplica filtro cuando el search queda vacío al sanitizar', async () => {
        const consulta = consultaSupabase({ data: [], count: 0, error: null });
        from.mockReturnValue(consulta);

        await service.obtenerTodas(1, 10, ',,,%%%');

        expect(consulta.or).not.toHaveBeenCalled();
    });

    it('responde 404 si la factura a consultar no existe', async () => {
        from.mockReturnValue(consultaSupabase({
            data: null,
            error: { code: 'PGRST116', message: 'no rows' },
        }));

        await expect(service.obtenerPorId(FACTURA_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('responde 409 si se intenta anular un comprobante autorizado', async () => {
        from.mockReturnValue(consultaSupabase({
            data: { id: FACTURA_ID, estado_sri: 'AUTORIZADO' },
            error: null,
        }));

        await expect(service.anularFactura(FACTURA_ID)).rejects.toBeInstanceOf(ConflictException);
    });

    it('al anular suelta las órdenes y les devuelve el abono anterior', async () => {
        const facturas = consultaSupabase(
            { data: { id: FACTURA_ID, estado_sri: 'RECHAZADO' }, error: null },
            { data: null, error: null },
        );
        const ordenes = consultaSupabase(
            {
                data: [{ id: ORDEN_ID, abono_antes_facturar: 50 }],
                error: null,
            },
            { data: null, error: null },
        );
        from.mockImplementation((tabla: string) => (
            tabla === 'ordenes_pedido' ? ordenes : facturas
        ));

        await expect(service.anularFactura(FACTURA_ID)).resolves.toEqual({
            mensaje: 'Factura anulada. Las órdenes asociadas recuperaron su saldo pendiente.',
        });
        expect(ordenes.update).toHaveBeenCalledWith({
            factura_id: null,
            abono: 50,
            abono_antes_facturar: null,
            saldo_antes_facturar: null,
        });
    });

    it('responde 404 si la factura a anular no existe', async () => {
        from.mockReturnValue(consultaSupabase({
            data: null,
            error: { code: 'PGRST116', message: 'no rows' },
        }));

        await expect(service.anularFactura(FACTURA_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('guarda el XML del comprobante autorizado y no un sobre SOAP', async () => {
        const clientes = consultaSupabase({ data: { ...cliente, correo: 'juan@example.com' }, error: null });
        const facturas = consultaSupabase(
            { data: { id: FACTURA_ID, secuencial_local: 8 }, error: null },
            { data: null, error: null },
        );
        const detalles = consultaSupabase({ data: null, error: null });
        from.mockImplementation((tabla: string) => {
            if (tabla === 'clientes') return clientes;
            if (tabla === 'factura_detalles') return detalles;
            return facturas;
        });

        await service.emitirFactura({
            cliente_id: CLIENTE_ID,
            detalles: [{ descripcion: 'Traje', cantidad: 1, precio_unitario: 200 }],
        });

        expect(facturas.update).toHaveBeenCalledWith(expect.objectContaining({
            estado_sri: 'AUTORIZADO',
            clave_acceso_sri: '1'.repeat(49),
            xml_url: '<factura id="comprobante">autorizada</factura>',
        }));
    });

    it('responde 409 si se pide RIDE de una factura no autorizada', async () => {
        from.mockReturnValue(consultaSupabase({
            data: { id: FACTURA_ID, estado_sri: 'PROCESANDO', xml_url: '<factura/>' },
            error: null,
        }));

        await expect(service.generarRide(FACTURA_ID)).rejects.toBeInstanceOf(ConflictException);
    });

    it('genera el RIDE desde el XML autorizado guardado', async () => {
        const xml = `<?xml version="1.0"?>
<factura id="comprobante" version="1.1.0">
  <infoTributaria>
    <ambiente>1</ambiente><tipoEmision>1</tipoEmision>
    <razonSocial>Emisor</razonSocial><nombreComercial>Trajes</nombreComercial>
    <ruc>1753329182001</ruc><claveAcceso>${'1'.repeat(49)}</claveAcceso>
    <codDoc>01</codDoc><estab>001</estab><ptoEmi>001</ptoEmi>
    <secuencial>000000008</secuencial><dirMatriz>Quito</dirMatriz>
  </infoTributaria>
  <infoFactura>
    <fechaEmision>02/11/2026</fechaEmision>
    <tipoIdentificacionComprador>05</tipoIdentificacionComprador>
    <razonSocialComprador>Juan</razonSocialComprador>
    <identificacionComprador>1710034065</identificacionComprador>
    <totalSinImpuestos>10.00</totalSinImpuestos><totalDescuento>0.00</totalDescuento>
    <totalConImpuestos><totalImpuesto><codigo>2</codigo><codigoPorcentaje>0</codigoPorcentaje><baseImponible>10.00</baseImponible><valor>0.00</valor></totalImpuesto></totalConImpuestos>
    <importeTotal>10.00</importeTotal><moneda>DOLAR</moneda>
  </infoFactura>
  <detalles><detalle>
    <codigoPrincipal>P-001</codigoPrincipal><descripcion>Item</descripcion>
    <cantidad>1.00</cantidad><precioUnitario>10.00</precioUnitario>
    <descuento>0.00</descuento><precioTotalSinImpuesto>10.00</precioTotalSinImpuesto>
  </detalle></detalles>
</factura>`;
        from.mockReturnValue(consultaSupabase({
            data: {
                id: FACTURA_ID,
                estado_sri: 'AUTORIZADO',
                xml_url: xml,
                clave_acceso_sri: '1'.repeat(49),
                numero_factura_sri: '000000008',
                secuencial_local: 8,
            },
            error: null,
        }));

        const ride = await service.generarRide(FACTURA_ID);
        expect(ride.filename).toBe('RIDE-001-001-000000008.pdf');
        expect(ride.buffer.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('al reintentar reutiliza la clave y el XML firmado guardados', async () => {
        const clave = '2'.repeat(49);
        const xmlFirmado = '<factura id="comprobante">firmada</factura>';
        const facturas = consultaSupabase(
            {
                data: {
                    id: FACTURA_ID,
                    estado_sri: 'ERROR_CONEXION',
                    secuencial_local: 8,
                    subtotal_factura: 200,
                    metodo_pago: 'Efectivo',
                    clave_acceso_sri: clave,
                    xml_url: xmlFirmado,
                    clientes: { ...cliente, correo: 'juan@example.com' },
                    factura_detalles: [detalleOrden],
                },
                error: null,
            },
            { data: [], error: null },
            { data: null, error: null },
        );
        from.mockReturnValue(facturas);

        await service.reintentarSri(FACTURA_ID);

        expect(sriService.procesarFacturaElectronica).toHaveBeenCalledWith(expect.objectContaining({
            claveAcceso: clave,
            xmlFirmado,
        }));
    });
});
