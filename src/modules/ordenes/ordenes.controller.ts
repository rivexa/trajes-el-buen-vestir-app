import { Controller, Post, Body, Get, Param, Patch, Delete, Query, ParseUUIDPipe } from '@nestjs/common';
import { CreateOrdenDto, RegistrarPagoDto } from './dto/orden.dto';
import { OrdenesService } from './ordenes.service';

@Controller('ordenes')
export class OrdenesController {
    constructor(private readonly ordenesService: OrdenesService) { }

    @Get()
    async obtenerTodas(
        @Query('page') page: string,
        @Query('limit') limit: string,
        @Query('search') search: string,
    ) {
        return this.ordenesService.obtenerTodos(Number(page) || 1, Number(limit) || 10, search);
    }

    @Get('pagos/historial')
    async historialPagos(
        @Query('desde') desde?: string,
        @Query('hasta') hasta?: string,
    ) {
        return this.ordenesService.historialPagos(desde, hasta);
    }

    @Post('nueva')
    async crearOrden(@Body() body: CreateOrdenDto) {
        return this.ordenesService.crearOrden(body);
    }

    @Get(':id/pagos')
    async pagosDeOrden(@Param('id', ParseUUIDPipe) id: string) {
        return this.ordenesService.obtenerPagosDeOrden(id);
    }

    @Get(':id')
    async obtenerOrdenCompleta(@Param('id', ParseUUIDPipe) id: string) {
        return this.ordenesService.obtenerOrden(id);
    }

    @Patch(':id/editar')
    async modificarOrden(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() body: CreateOrdenDto,
    ) {
        return this.ordenesService.actualizarOrden(id, body);
    }

    @Patch(':id/estado')
    async cambiarEstadoOrden(
        @Param('id', ParseUUIDPipe) id: string,
        @Body('estado') estado: string,
    ) {
        return this.ordenesService.actualizarEstado(id, estado);
    }

    @Patch(':id/pago')
    async registrarPago(@Param('id', ParseUUIDPipe) id: string, @Body() body: RegistrarPagoDto) {
        return this.ordenesService.registrarPago(id, body.monto, {
            metodo_pago: body.metodo_pago,
            nota: body.nota,
        });
    }

    @Delete(':id')
    async anularOrden(@Param('id', ParseUUIDPipe) id: string) {
        return this.ordenesService.eliminarOrden(id);
    }
}
