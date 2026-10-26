import { Controller, Post, Body, Get, Param, Patch } from '@nestjs/common';
import { CreateOrdenDto, RegistrarPagoDto } from './dto/orden.dto';
import { OrdenesService } from './ordenes.service';

@Controller('ordenes')
export class OrdenesController {
    constructor(private readonly ordenesService: OrdenesService) { }

    @Post('nueva')
    async crearOrden(@Body() body: CreateOrdenDto) {
        return this.ordenesService.crearOrden(body);
    }

    @Get(':id')
    async obtenerOrdenCompleta(@Param('id') id: string) {
        return this.ordenesService.obtenerOrden(id);
    }

    @Patch(':id/pago')
    async registrarPago(@Param('id') id: string, @Body() body: RegistrarPagoDto) {
        return this.ordenesService.registrarPago(id, body.monto);
    }
}