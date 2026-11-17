import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';

export interface WhatsAppTextoEnvio {
    telefonoE164: string;
    texto: string;
}

export interface WhatsAppEnvioResultado {
    ok: boolean;
    omitido?: boolean;
    messageId?: string;
    error?: string;
    raw?: unknown;
}

/**
 * Cliente Evolution API (VPS) — envío de texto libre.
 * Env: EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE
 */
@Injectable()
export class WhatsAppClient {
    private readonly logger = new Logger(WhatsAppClient.name);

    constructor(private readonly config: ConfigService) { }

    configurado(): boolean {
        return Boolean(
            this.config.get<string>('EVOLUTION_API_URL')?.trim()
            && this.config.get<string>('EVOLUTION_API_KEY')?.trim()
            && this.config.get<string>('EVOLUTION_INSTANCE')?.trim(),
        );
    }

    async enviarTexto(envio: WhatsAppTextoEnvio): Promise<WhatsAppEnvioResultado> {
        const base = this.config.get<string>('EVOLUTION_API_URL')?.trim()?.replace(/\/$/, '');
        const apiKey = this.config.get<string>('EVOLUTION_API_KEY')?.trim();
        const instance = this.config.get<string>('EVOLUTION_INSTANCE')?.trim();

        if (!base || !apiKey || !instance) {
            this.logger.warn('Evolution API no configurada (EVOLUTION_API_URL / KEY / INSTANCE). Envío omitido.');
            return { ok: false, omitido: true, error: 'Evolution API no configurada.' };
        }

        const url = `${base}/message/sendText/${encodeURIComponent(instance)}`;
        const body = {
            number: envio.telefonoE164,
            text: envio.texto,
        };

        try {
            const { data } = await axios.post(url, body, {
                headers: {
                    apikey: apiKey,
                    'Content-Type': 'application/json',
                },
                timeout: 20_000,
            });
            const messageId = (data?.key?.id || data?.messageId || data?.id) as string | undefined;
            return { ok: true, messageId, raw: data };
        } catch (err) {
            const ax = err as AxiosError<{ message?: string; error?: string }>;
            const mensaje = ax.response?.data?.message
                || ax.response?.data?.error
                || ax.message
                || 'Error al llamar Evolution API';
            this.logger.error(`Evolution API: ${mensaje}`);
            return { ok: false, error: mensaje, raw: ax.response?.data };
        }
    }
}
