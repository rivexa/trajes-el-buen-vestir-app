import { Controller, Get, Param, ParseUUIDPipe, Post, Query, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { MensajeriaService } from './mensajeria.service';

@Controller('mensajes')
export class MensajeriaController {
    constructor(private readonly mensajeriaService: MensajeriaService) { }

    @Get('fallidos')
    async fallidos(
        @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    ) {
        return this.mensajeriaService.listarFallidos(limit);
    }

    @Post(':id/reintentar')
    async reintentar(@Param('id', ParseUUIDPipe) id: string) {
        return this.mensajeriaService.reintentar(id);
    }

    /** Disparo manual del job de recordatorios (ops / prueba). */
    @Post('recordatorios/ejecutar')
    async ejecutarRecordatorios() {
        return this.mensajeriaService.procesarRecordatorios();
    }
}
