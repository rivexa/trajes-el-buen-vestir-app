import { Controller, Post, Body, Get, Query, Param, Delete} from '@nestjs/common';
import { FacturacionService } from './facturacion.service';
import { CreateFacturaDto } from './dto/factura.dto';

@Controller('facturacion')
export class FacturacionController {
    constructor(private readonly facturacionService: FacturacionService) { }

    @Get()
    async obtenerTodas(
        @Query('page') page: string,
        @Query('limit') limit: string,
        @Query('search') search: string
    ) {
        return await this.facturacionService.obtenerTodas(Number(page) || 1, Number(limit) || 10, search);
    }

    @Post('emitir')
    async generarYEnviar(@Body() body: CreateFacturaDto) {
        return await this.facturacionService.emitirFactura(body);
    }

    @Get(':id')
    async obtenerPorId(@Param('id') id: string) {
        return await this.facturacionService.obtenerPorId(id);
    }

    @Post(':id/reintentar')
    async reintentarSri(@Param('id') id: string) {
        return await this.facturacionService.reintentarSri(id);
    }

    @Delete(':id')
    async anularFactura(@Param('id') id: string) {
        return await this.facturacionService.anularFactura(id);
    }
}