import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

export interface CorreoEnvio {
    para: string;
    asunto: string;
    html: string;
    texto?: string;
}

export interface CorreoEnvioResultado {
    ok: boolean;
    omitido?: boolean;
    messageId?: string;
    error?: string;
}

@Injectable()
export class CorreoClient {
    private readonly logger = new Logger(CorreoClient.name);

    constructor(private readonly config: ConfigService) { }

    configurado(): boolean {
        return Boolean(
            this.config.get<string>('SMTP_HOST')?.trim()
            && this.config.get<string>('SMTP_USER')?.trim()
            && this.config.get<string>('SMTP_PASS')?.trim()
            && this.config.get<string>('SMTP_FROM')?.trim(),
        );
    }

    async enviar(envio: CorreoEnvio): Promise<CorreoEnvioResultado> {
        const host = this.config.get<string>('SMTP_HOST')?.trim();
        const port = Number(this.config.get<string>('SMTP_PORT') || 587);
        const user = this.config.get<string>('SMTP_USER')?.trim();
        const pass = this.config.get<string>('SMTP_PASS')?.trim();
        const from = this.config.get<string>('SMTP_FROM')?.trim();

        if (!host || !user || !pass || !from) {
            this.logger.warn('SMTP no configurado. Correo omitido.');
            return { ok: false, omitido: true, error: 'SMTP no configurado.' };
        }

        try {
            const transporter = nodemailer.createTransport({
                host,
                port,
                secure: port === 465,
                auth: { user, pass },
            });
            const info = await transporter.sendMail({
                from,
                to: envio.para,
                subject: envio.asunto,
                html: envio.html,
                text: envio.texto,
            });
            return { ok: true, messageId: info.messageId };
        } catch (err) {
            const mensaje = err instanceof Error ? err.message : 'Error al enviar correo';
            this.logger.error(`SMTP: ${mensaje}`);
            return { ok: false, error: mensaje };
        }
    }
}
