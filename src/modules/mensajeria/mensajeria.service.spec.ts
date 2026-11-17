import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { SupabaseService } from '../../config/supabase.service';
import { CorreoClient } from './correo.client';
import { MensajeriaService } from './mensajeria.service';
import { WhatsAppClient } from './whatsapp.client';

type ResultadoConsulta = {
    data?: unknown;
    error?: { code?: string; message?: string } | null;
};

function consultaSupabase(...resultados: ResultadoConsulta[]) {
    const cola = [...resultados];
    const consulta: any = {};
    for (const metodo of [
        'select', 'insert', 'update', 'eq', 'neq', 'in', 'not', 'order', 'limit', 'single',
    ]) {
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

describe('MensajeriaService', () => {
    let service: MensajeriaService;
    let from: jest.Mock;
    const whatsapp = {
        configurado: jest.fn().mockReturnValue(true),
        enviarTexto: jest.fn(),
    };
    const correo = {
        configurado: jest.fn().mockReturnValue(true),
        enviar: jest.fn(),
    };

    beforeEach(async () => {
        from = jest.fn();
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                MensajeriaService,
                { provide: SupabaseService, useValue: { getClient: () => ({ from }) } },
                { provide: WhatsAppClient, useValue: whatsapp },
                { provide: CorreoClient, useValue: correo },
                {
                    provide: ConfigService,
                    useValue: {
                        get: (key: string) => {
                            const mapa: Record<string, string> = {
                                NEGOCIO_EMAIL: 'taller@example.com',
                                NEGOCIO_WHATSAPP: '0987654321',
                            };
                            return mapa[key];
                        },
                    },
                },
            ],
        }).compile();
        service = module.get(MensajeriaService);
        service.onModuleDestroy();
        jest.clearAllMocks();
    });

    it('no envía si el estado no tiene aviso', async () => {
        await expect(service.avisarPorEstado({
            detalleId: 'd1',
            ordenId: 'o1',
            estado: 'Pendiente',
        })).resolves.toEqual({ enviado: false, motivo: 'estado_sin_aviso' });
        expect(whatsapp.enviarTexto).not.toHaveBeenCalled();
    });

    it('envía WhatsApp al cliente al pasar a Terminado', async () => {
        const orden = consultaSupabase({
            data: {
                id: 'o1',
                numero_orden: 12,
                cliente_id: 'c1',
                clientes: { id: 'c1', nombres: 'Ana', apellidos: 'Pérez', telefono: '0981112233' },
                orden_detalles: [{ id: 'd1', fecha_entrega: '2026-04-01', descripcion: 'Traje' }],
            },
            error: null,
        });
        const logs = consultaSupabase({ data: { id: 'm1', estado: 'ENVIADO' }, error: null });
        from.mockImplementation((tabla: string) => (tabla === 'mensaje_envios' ? logs : orden));
        whatsapp.enviarTexto.mockResolvedValue({ ok: true, messageId: 'ev.1' });

        const r = await service.avisarPorEstado({
            detalleId: 'd1',
            ordenId: 'o1',
            estado: 'Terminado',
        });

        expect(r.enviado).toBe(true);
        expect(whatsapp.enviarTexto).toHaveBeenCalledWith(expect.objectContaining({
            telefonoE164: '593981112233',
            texto: expect.stringContaining('listo para retirar'),
        }));
    });

    it('recordatorio avisa al negocio por correo y WhatsApp (no al cliente)', async () => {
        const lineas = consultaSupabase({
            data: [{
                id: 'd1',
                orden_id: 'o1',
                estado: 'En Confección',
                fecha_entrega: '2099-01-01',
                descripcion: 'Uniforme colegio',
                tipo_item: 'Uniformes',
                ordenes_pedido: {
                    id: 'o1',
                    numero_orden: 7,
                    cliente_id: 'c1',
                    clientes: { id: 'c1', nombres: 'Luis', apellidos: 'Mora', telefono: '0999999999' },
                },
            }],
            error: null,
        });
        const logsCheck = consultaSupabase({ data: [], error: null });
        const logsInsert = consultaSupabase({ data: { id: 'm2', estado: 'ENVIADO' }, error: null });
        let mensajeCalls = 0;
        from.mockImplementation((tabla: string) => {
            if (tabla === 'orden_detalles') return lineas;
            mensajeCalls += 1;
            return mensajeCalls === 1 ? logsCheck : logsInsert;
        });
        // Forzar fecha objetivo: mock procesarRecordatorios by stubbing private is hard;
        // instead call enviar path via procesar with eq matching - we need fechaEcuadorMasDias = linea fecha.
        // Override by setting linea fecha to whatever job computes — spy fecha via reimplement:
        jest.spyOn(service as never, 'fechaEcuadorMasDias' as never).mockReturnValue('2099-01-01' as never);

        correo.enviar.mockResolvedValue({ ok: true, messageId: 'mail.1' });
        whatsapp.enviarTexto.mockResolvedValue({ ok: true, messageId: 'ev.2' });

        const r = await service.procesarRecordatorios();
        expect(r.procesados).toBe(1);
        expect(correo.enviar).toHaveBeenCalledWith(expect.objectContaining({
            para: 'taller@example.com',
            asunto: expect.stringContaining('ORD-7'),
        }));
        expect(whatsapp.enviarTexto).toHaveBeenCalledWith(expect.objectContaining({
            telefonoE164: '593987654321',
            texto: expect.stringContaining('Recordatorio de entrega'),
        }));
        // No debe usar el teléfono del cliente
        expect(whatsapp.enviarTexto).not.toHaveBeenCalledWith(expect.objectContaining({
            telefonoE164: '593999999999',
        }));
    });
});
