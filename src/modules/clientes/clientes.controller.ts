import { Controller, Get, Post, Patch, Delete, Body, Param, Query, DefaultValuePipe, ParseIntPipe, ParseUUIDPipe } from '@nestjs/common';
import { CLIENTES_LIMITE_POR_DEFECTO, CLIENTES_PAGINA_MINIMA } from './clientes.consulta';
import { ClientesService } from './clientes.service';
import { CreateClienteDto, UpdateClienteDto } from './dto/cliente.dto';

@Controller('clientes')
export class ClientesController {
    constructor(private readonly clientesService: ClientesService) { }

    @Get()
    async obtenerTodos(
        @Query('page', new DefaultValuePipe(CLIENTES_PAGINA_MINIMA), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(CLIENTES_LIMITE_POR_DEFECTO), ParseIntPipe) limit: number,
        @Query('search') search?: string,
    ) {
        return this.clientesService.obtenerTodos(page, limit, search ?? '');
    }

    @Get('buscar/:cedula')
    async buscarCliente(@Param('cedula') cedula: string) {
        return this.clientesService.buscarPorCedula(cedula);
    }

    @Post()
    async crearCliente(@Body() body: CreateClienteDto) {
        return this.clientesService.crearCliente(body);
    }

    @Patch(':id')
    async actualizar(@Param('id', ParseUUIDPipe) id: string, @Body() cliente: UpdateClienteDto) {
        return this.clientesService.actualizar(id, cliente);
    }

    @Delete(':id')
    async eliminar(@Param('id', ParseUUIDPipe) id: string) {
        return this.clientesService.eliminar(id);
    }
}