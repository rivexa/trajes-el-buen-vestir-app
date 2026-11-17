import {
    Injectable,
    InternalServerErrorException,
    Logger,
    NotFoundException,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../config/supabase.service';
import { CorreoClient } from './correo.client';
import {
    htmlRecordatorioNegocio,
    textoCliente,
    textoRecordatorioNegocio,
} from './mensajeria.templates';
import {
    ContextoPlantilla,
    TipoMensaje,
    tipoMensajePorEstadoLinea,
} from './mensajeria.tipos';
import { normalizarTelefonoEc } from './telefono';
import { WhatsAppClient } from './whatsapp.client';

const INTERVALO_RECORDATORIOS_MS = 60 * 60 * 1000;

export interface AvisoEstadoInput {
    detalleId: string;
    ordenId: string;
    estado: string;
    fechaEntrega?: string;
    descripcion?: string;
}

@Injectable()
export class MensajeriaService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(MensajeriaService.name);
    private timerRecordatorios?: NodeJS.Timeout;
    private corriendoRecordatorios = false;

    constructor(
        private readonly supabase: SupabaseService,
        private readonly whatsapp: WhatsAppClient,
        private readonly correo: CorreoClient,
        private readonly config: ConfigService,
    ) { }

    onModuleInit() {
        this.timerRecordatorios = setInterval(() => {
            void this.procesarRecordatorios().catch((err) => {
                this.logger.error(`Job recordatorios: ${err instanceof Error ? err.message : err}`);
            });
        }, INTERVALO_RECORDATORIOS_MS);
        setTimeout(() => {
            void this.procesarRecordatorios().catch(() => undefined);
        }, 15_000);
    }

    onModuleDestroy() {
        if (this.timerRecordatorios) clearInterval(this.timerRecordatorios);
    }

    /** Aviso WhatsApp al cliente al pasar a Listo para Prueba / Terminado. */
    async avisarPorEstado(input: AvisoEstadoInput) {
        const tipo = tipoMensajePorEstadoLinea(input.estado);
        if (!tipo) {
            return { enviado: false, motivo: 'estado_sin_aviso' as const };
        }

        const contexto = await this.cargarContextoOrden(input.ordenId, input.detalleId, {
            fechaEntrega: input.fechaEntrega,
            descripcionLinea: input.descripcion,
        });
        if (!contexto) {
            return { enviado: false, motivo: 'sin_contexto' as const };
        }

        const texto = textoCliente(tipo, contexto.plantilla);
        return this.enviarWhatsAppClienteYRegistrar({
            tipo,
            clienteId: contexto.clienteId,
            ordenId: input.ordenId,
            detalleId: input.detalleId,
            telefonoRaw: contexto.telefonoRaw,
            ctx: contexto.plantilla,
            texto,
        });
    }

    /**
     * Recordatorio al NEGOCIO (correo + Evolution), 2 días antes de fecha_entrega de la línea.
     * No se envía al cliente.
     */
    async procesarRecordatorios() {
        if (this.corriendoRecordatorios) return { procesados: 0 };
        this.corriendoRecordatorios = true;
        try {
            const fechaObjetivo = this.fechaEcuadorMasDias(2);
            const { data: lineas, error } = await this.supabase.getClient()
                .from('orden_detalles')
                .select('id, orden_id, estado, fecha_entrega, descripcion, tipo_item, ordenes_pedido!inner(id, numero_orden, cliente_id, clientes(id, nombres, apellidos, telefono))')
                .eq('fecha_entrega', fechaObjetivo)
                .neq('estado', 'Anulada')
                .neq('estado', 'Entregado')
                .limit(200);

            if (error) {
                this.logger.error(`No se pudieron listar recordatorios [${error.code}] ${error.message}`);
                return { procesados: 0 };
            }

            let procesados = 0;
            for (const linea of lineas ?? []) {
                const ya = await this.yaEnvioExitoso(linea.id, 'RECORDATORIO');
                if (ya) continue;

                type ClienteEmb = { id: string; nombres?: string; apellidos?: string; telefono?: string };
                type OrdenEmb = {
                    id: string;
                    numero_orden: number;
                    cliente_id: string;
                    clientes?: ClienteEmb | ClienteEmb[] | null;
                };
                const orden = uno(linea.ordenes_pedido as unknown as OrdenEmb | OrdenEmb[] | null);
                const cliente = uno(orden?.clientes ?? null);
                if (!orden || !cliente) continue;

                const ctx: ContextoPlantilla & { tipoItem?: string; estado?: string } = {
                    nombreCliente: `${cliente.nombres ?? ''} ${cliente.apellidos ?? ''}`.trim(),
                    numeroOrden: orden.numero_orden,
                    fechaEntrega: String(linea.fecha_entrega),
                    descripcionLinea: linea.descripcion,
                    tipoItem: linea.tipo_item,
                    estado: linea.estado,
                };

                await this.enviarRecordatorioNegocio({
                    clienteId: cliente.id,
                    ordenId: orden.id,
                    detalleId: linea.id,
                    ctx,
                });
                procesados += 1;
            }
            return { procesados, fecha_objetivo: fechaObjetivo };
        } finally {
            this.corriendoRecordatorios = false;
        }
    }

    async reintentar(id: string) {
        const { data: registro, error } = await this.supabase.getClient()
            .from('mensaje_envios')
            .select('*')
            .eq('id', id)
            .single();

        if (error && error.code !== 'PGRST116') {
            throw new InternalServerErrorException('No se pudo consultar el mensaje.');
        }
        if (error || !registro) {
            throw new NotFoundException('Mensaje no encontrado.');
        }
        if (registro.estado === 'ENVIADO') {
            return { mensaje: 'El mensaje ya fue enviado.', registro };
        }

        const ctx = (registro.payload?.contexto ?? {}) as ContextoPlantilla & { tipoItem?: string; estado?: string };
        const tipo = registro.tipo as TipoMensaje;
        const intentos = Number(registro.intentos || 0) + 1;

        if (tipo === 'RECORDATORIO') {
            const resultado = await this.despacharRecordatorioNegocio(ctx);
            const update = {
                estado: resultado.ok ? 'ENVIADO' : (resultado.omitido ? 'OMITIDO' : 'ERROR'),
                intentos,
                error: resultado.ok ? null : (resultado.error ?? 'Error'),
                provider_message_id: resultado.messageId ?? null,
                payload: { ...(registro.payload ?? {}), ultimo_resultado: resultado.detalle },
                updated_at: new Date().toISOString(),
            };
            const { data: actualizado, error: errUp } = await this.supabase.getClient()
                .from('mensaje_envios')
                .update(update)
                .eq('id', id)
                .select()
                .single();
            if (errUp) throw new InternalServerErrorException('No se pudo actualizar el reintento.');
            return { mensaje: resultado.ok ? 'Reenviado correctamente' : 'Reintento fallido', registro: actualizado };
        }

        const texto = (registro.payload?.texto as string)
            || textoCliente(tipo, {
                nombreCliente: ctx.nombreCliente || 'cliente',
                numeroOrden: ctx.numeroOrden || '',
                fechaEntrega: ctx.fechaEntrega,
            });
        const telefono = registro.telefono || normalizarTelefonoEc(registro.telefono);
        if (!telefono) {
            throw new InternalServerErrorException('El registro no tiene teléfono válido para reintentar.');
        }

        const resultado = await this.whatsapp.enviarTexto({ telefonoE164: telefono, texto });
        const update = {
            estado: resultado.ok ? 'ENVIADO' : (resultado.omitido ? 'OMITIDO' : 'ERROR'),
            intentos,
            error: resultado.ok ? null : (resultado.error ?? 'Error'),
            provider_message_id: resultado.messageId ?? null,
            updated_at: new Date().toISOString(),
        };
        const { data: actualizado, error: errUp } = await this.supabase.getClient()
            .from('mensaje_envios')
            .update(update)
            .eq('id', id)
            .select()
            .single();
        if (errUp) throw new InternalServerErrorException('No se pudo actualizar el reintento.');
        return { mensaje: resultado.ok ? 'Reenviado correctamente' : 'Reintento fallido', registro: actualizado };
    }

    async listarFallidos(limit = 50) {
        const { data, error } = await this.supabase.getClient()
            .from('mensaje_envios')
            .select('*')
            .in('estado', ['ERROR', 'OMITIDO', 'PENDIENTE'])
            .order('created_at', { ascending: false })
            .limit(Math.min(100, Math.max(1, limit)));

        if (error) throw new InternalServerErrorException('No se pudieron listar los mensajes.');
        return { data: data ?? [] };
    }

    private async enviarRecordatorioNegocio(args: {
        clienteId: string;
        ordenId: string;
        detalleId: string;
        ctx: ContextoPlantilla & { tipoItem?: string; estado?: string };
    }) {
        const resultado = await this.despacharRecordatorioNegocio(args.ctx);
        const telefonoNegocio = this.telefonoNegocio() || '';
        return this.insertarLog({
            cliente_id: args.clienteId,
            orden_id: args.ordenId,
            detalle_id: args.detalleId,
            tipo: 'RECORDATORIO',
            telefono: telefonoNegocio,
            plantilla: 'recordatorio_negocio',
            estado: resultado.ok ? 'ENVIADO' : (resultado.omitido ? 'OMITIDO' : 'ERROR'),
            intentos: 1,
            error: resultado.ok ? null : (resultado.error ?? 'Error'),
            provider_message_id: resultado.messageId ?? null,
            payload: {
                destinatario: 'negocio',
                contexto: args.ctx,
                texto: textoRecordatorioNegocio(args.ctx),
                ultimo_resultado: resultado.detalle,
            },
        });
    }

    private async despacharRecordatorioNegocio(
        ctx: ContextoPlantilla & { tipoItem?: string; estado?: string },
    ) {
        const emailNegocio = this.config.get<string>('NEGOCIO_EMAIL')?.trim();
        const telefono = this.telefonoNegocio();
        const texto = textoRecordatorioNegocio(ctx);
        const html = htmlRecordatorioNegocio(ctx);
        const detalle: Record<string, unknown> = {};

        let okAlgo = false;
        let omitidoTodo = true;
        const errores: string[] = [];
        let messageId: string | undefined;

        if (emailNegocio) {
            const mail = await this.correo.enviar({
                para: emailNegocio,
                asunto: `Recordatorio entrega ORD-${ctx.numeroOrden} (${ctx.fechaEntrega})`,
                html,
                texto,
            });
            detalle.correo = mail;
            if (mail.ok) {
                okAlgo = true;
                omitidoTodo = false;
                messageId = mail.messageId;
            } else if (!mail.omitido) {
                omitidoTodo = false;
                errores.push(mail.error || 'Error correo');
            }
        } else {
            detalle.correo = { omitido: true, error: 'Falta NEGOCIO_EMAIL' };
        }

        if (telefono) {
            const wa = await this.whatsapp.enviarTexto({ telefonoE164: telefono, texto });
            detalle.whatsapp = wa;
            if (wa.ok) {
                okAlgo = true;
                omitidoTodo = false;
                messageId = messageId || wa.messageId;
            } else if (!wa.omitido) {
                omitidoTodo = false;
                errores.push(wa.error || 'Error WhatsApp');
            }
        } else {
            detalle.whatsapp = { omitido: true, error: 'Falta NEGOCIO_WHATSAPP (celular)' };
        }

        if (okAlgo) {
            return { ok: true, omitido: false, messageId, detalle };
        }
        if (omitidoTodo) {
            return { ok: false, omitido: true, error: 'Correo y WhatsApp del negocio no configurados.', detalle };
        }
        return { ok: false, omitido: false, error: errores.join('; ') || 'Error en recordatorio', detalle };
    }

    private async enviarWhatsAppClienteYRegistrar(args: {
        tipo: TipoMensaje;
        clienteId: string;
        ordenId: string;
        detalleId: string;
        telefonoRaw?: string | null;
        ctx: ContextoPlantilla;
        texto: string;
    }) {
        const telefono = normalizarTelefonoEc(args.telefonoRaw);
        const payload = {
            destinatario: 'cliente',
            contexto: args.ctx,
            texto: args.texto,
        };

        if (!telefono) {
            const registro = await this.insertarLog({
                cliente_id: args.clienteId,
                orden_id: args.ordenId,
                detalle_id: args.detalleId,
                tipo: args.tipo,
                telefono: args.telefonoRaw || '',
                plantilla: null,
                estado: 'OMITIDO',
                intentos: 0,
                error: 'Teléfono móvil del cliente inválido o ausente.',
                payload,
            });
            return { enviado: false, motivo: 'telefono_invalido' as const, registro };
        }

        const resultado = await this.whatsapp.enviarTexto({
            telefonoE164: telefono,
            texto: args.texto,
        });

        const registro = await this.insertarLog({
            cliente_id: args.clienteId,
            orden_id: args.ordenId,
            detalle_id: args.detalleId,
            tipo: args.tipo,
            telefono,
            plantilla: null,
            estado: resultado.ok ? 'ENVIADO' : (resultado.omitido ? 'OMITIDO' : 'ERROR'),
            intentos: 1,
            error: resultado.ok ? null : (resultado.error ?? 'Error'),
            provider_message_id: resultado.messageId ?? null,
            payload,
        });

        return {
            enviado: Boolean(resultado.ok),
            motivo: resultado.ok ? 'ok' as const : (resultado.omitido ? 'omitido' as const : 'error' as const),
            registro,
        };
    }

    private telefonoNegocio(): string | null {
        return normalizarTelefonoEc(this.config.get<string>('NEGOCIO_WHATSAPP'));
    }

    private async insertarLog(fila: Record<string, unknown>) {
        const { data, error } = await this.supabase.getClient()
            .from('mensaje_envios')
            .insert([{ ...fila, updated_at: new Date().toISOString() }])
            .select()
            .single();

        if (error) {
            this.logger.error(`No se pudo guardar mensaje_envios [${error.code}] ${error.message}`);
            return null;
        }
        return data;
    }

    private async yaEnvioExitoso(detalleId: string, tipo: TipoMensaje): Promise<boolean> {
        const { data, error } = await this.supabase.getClient()
            .from('mensaje_envios')
            .select('id')
            .eq('detalle_id', detalleId)
            .eq('tipo', tipo)
            .eq('estado', 'ENVIADO')
            .limit(1);

        if (error) {
            this.logger.error(`No se pudo verificar envío previo [${error.code}] ${error.message}`);
            return false;
        }
        return (data?.length ?? 0) > 0;
    }

    private async cargarContextoOrden(
        ordenId: string,
        detalleId: string,
        extras: { fechaEntrega?: string; descripcionLinea?: string },
    ) {
        const { data, error } = await this.supabase.getClient()
            .from('ordenes_pedido')
            .select('id, numero_orden, cliente_id, clientes(id, nombres, apellidos, telefono), orden_detalles(id, fecha_entrega, descripcion)')
            .eq('id', ordenId)
            .single();

        if (error || !data) {
            this.logger.error(`Contexto orden ${ordenId}: ${error?.message ?? 'sin data'}`);
            return null;
        }

        type ClienteEmb = { id: string; nombres?: string; apellidos?: string; telefono?: string };
        const cliente = uno(data.clientes as unknown as ClienteEmb | ClienteEmb[] | null);
        if (!cliente) return null;

        const detalles = lista(
            data.orden_detalles as unknown as Array<{ id: string; fecha_entrega?: string; descripcion?: string }> | null,
        );
        const detalle = detalles.find((d) => d.id === detalleId);

        return {
            clienteId: cliente.id,
            telefonoRaw: cliente.telefono,
            plantilla: {
                nombreCliente: `${cliente.nombres ?? ''} ${cliente.apellidos ?? ''}`.trim(),
                numeroOrden: data.numero_orden,
                fechaEntrega: extras.fechaEntrega || detalle?.fecha_entrega,
                descripcionLinea: extras.descripcionLinea || detalle?.descripcion,
            } satisfies ContextoPlantilla,
        };
    }

    private fechaEcuadorMasDias(dias: number): string {
        const ahora = new Date();
        const enEc = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Guayaquil' }));
        enEc.setDate(enEc.getDate() + dias);
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Guayaquil',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(enEc);
    }
}

function uno<T>(valor: T | T[] | null | undefined): T | null {
    if (valor == null) return null;
    return Array.isArray(valor) ? (valor[0] ?? null) : valor;
}

function lista<T>(valor: T | T[] | null | undefined): T[] {
    if (valor == null) return [];
    return Array.isArray(valor) ? valor : [valor];
}
