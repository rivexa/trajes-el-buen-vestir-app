import { Controller, Post, Body, Get, Query, Param, Delete, DefaultValuePipe, ParseIntPipe, ParseUUIDPipe } from '@nestjs/common';
import { CreateFacturaDto } from './dto/factura.dto';
import { FACTURAS_LIMITE_POR_DEFECTO, FACTURAS_PAGINA_MINIMA } from './facturacion.consulta';
import { FacturacionService } from './facturacion.service';

@Controller('facturacion')
export class FacturacionController {
    constructor(private readonly facturacionService: FacturacionService) { }

    @Get()
    async obtenerTodas(
        @Query('page', new DefaultValuePipe(FACTURAS_PAGINA_MINIMA), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(FACTURAS_LIMITE_POR_DEFECTO), ParseIntPipe) limit: number,
        @Query('search') search?: string,
    ) {
        return this.facturacionService.obtenerTodas(page, limit, search ?? '');
    }

    @Post('emitir')
    async generarYEnviar(@Body() body: CreateFacturaDto) {
        return this.facturacionService.emitirFactura(body);
    }

    @Get(':id')
    async obtenerPorId(@Param('id', ParseUUIDPipe) id: string) {
        return this.facturacionService.obtenerPorId(id);
    }

    @Post(':id/reintentar')
    async reintentarSri(@Param('id', ParseUUIDPipe) id: string) {
        return this.facturacionService.reintentarSri(id);
    }

    @Delete(':id')
    async anularFactura(@Param('id', ParseUUIDPipe) id: string) {
        return this.facturacionService.anularFactura(id);
    }
}
