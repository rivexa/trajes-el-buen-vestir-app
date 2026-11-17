import { Module } from '@nestjs/common';
import { CorreoClient } from './correo.client';
import { MensajeriaController } from './mensajeria.controller';
import { MensajeriaService } from './mensajeria.service';
import { WhatsAppClient } from './whatsapp.client';

@Module({
    controllers: [MensajeriaController],
    providers: [WhatsAppClient, CorreoClient, MensajeriaService],
    exports: [MensajeriaService, WhatsAppClient, CorreoClient],
})
export class MensajeriaModule { }
