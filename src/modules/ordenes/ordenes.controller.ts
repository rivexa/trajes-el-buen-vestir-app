import { Controller, Post, Body, Get, Param, Patch, Delete, Query, DefaultValuePipe, ParseIntPipe, ParseUUIDPipe } from '@nestjs/common';
import { ActualizarEstadoOrdenDto, CreateOrdenDto, RegistrarPagoDto } from './dto/orden.dto';
import { ORDENES_LIMITE_POR_DEFECTO, ORDENES_PAGINA_MINIMA } from './ordenes.consulta';
import { OrdenesService } from './ordenes.service';

@Controller('ordenes')
export class OrdenesController {
    constructor(private readonly ordenesService: OrdenesService) { }

    @Get()
    async obtenerTodas(
        @Query('page', new DefaultValuePipe(ORDENES_PAGINA_MINIMA), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(ORDENES_LIMITE_POR_DEFECTO), ParseIntPipe) limit: number,
        @Query('search') search?: string,
    ) {
        return this.ordenesService.obtenerTodos(page, limit, search ?? '');
    }

    @Post('nueva')
    async crearOrden(@Body() body: CreateOrdenDto) {
        return this.ordenesService.crearOrden(body);
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
        @Body() body: ActualizarEstadoOrdenDto,
    ) {
        return this.ordenesService.actualizarEstado(id, body.estado);
    }

    @Patch(':id/pago')
    async registrarPago(@Param('id', ParseUUIDPipe) id: string, @Body() body: RegistrarPagoDto) {
        return this.ordenesService.registrarPago(id, body.monto);
    }

    @Delete(':id')
    async anularOrden(@Param('id', ParseUUIDPipe) id: string) {
        return this.ordenesService.eliminarOrden(id);
    }
}
