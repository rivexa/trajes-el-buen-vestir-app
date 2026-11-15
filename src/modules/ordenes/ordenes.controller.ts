import {
    Controller,
    Post,
    Body,
    Get,
    Param,
    Patch,
    Delete,
    Query,
    ParseUUIDPipe,
    DefaultValuePipe,
    ParseIntPipe,
} from '@nestjs/common';
import { ActualizarEstadoDetalleDto, CreateOrdenDto, RegistrarPagoDto } from './dto/orden.dto';
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
        @Query('estado') estado?: string,
        @Query('desde') desde?: string,
        @Query('hasta') hasta?: string,
        @Query('sort') sort?: string,
        @Query('order') order?: 'asc' | 'desc',
    ) {
        return this.ordenesService.obtenerTodos({
            page,
            limit,
            search,
            estado,
            desde,
            hasta,
            sort,
            order,
        });
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

    @Patch(':id/detalles/:detalleId/estado')
    async cambiarEstadoDetalle(
        @Param('id', ParseUUIDPipe) id: string,
        @Param('detalleId', ParseUUIDPipe) detalleId: string,
        @Body() body: ActualizarEstadoDetalleDto,
    ) {
        return this.ordenesService.actualizarEstadoDetalle(id, detalleId, body.estado);
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
