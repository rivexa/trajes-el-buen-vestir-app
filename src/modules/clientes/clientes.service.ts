import { ConflictException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../config/supabase.service';
import { acotarPaginacionClientes, sanitizarBusquedaCliente } from './clientes.consulta';
import { CreateClienteDto, UpdateClienteDto } from './dto/cliente.dto';

@Injectable()
export class ClientesService {
    private readonly logger = new Logger(ClientesService.name);

    constructor(private readonly supabaseService: SupabaseService) { }

    async obtenerTodos(page?: number, limit?: number, search = '') {
        const { page: pagina, limit: tamano } = acotarPaginacionClientes(page, limit);
        const termino = sanitizarBusquedaCliente(search);
        const from = (pagina - 1) * tamano;
        const to = from + tamano - 1;
        const supabase = this.supabaseService.getClient();

        let query = supabase
            .from('clientes')
            .select('*', { count: 'exact' });

        if (termino) {
            query = query.or(`cedula_ruc.ilike.%${termino}%,nombres.ilike.%${termino}%,apellidos.ilike.%${termino}%`);
        }

        const { data, count, error } = await query
            .order('nombres', { ascending: true })
            .range(from, to);

        if (error) this.falloPersistencia(error, 'No se pudo listar los clientes.');

        return {
            data,
            meta: {
                total: count,
                page: pagina,
                limit: tamano,
                totalPages: Math.ceil((count || 0) / tamano)
            }
        };
    }

    async buscarPorCedula(cedulaRuc: string) {
        const { data, error } = await this.supabaseService.getClient()
            .from('clientes')
            .select('*')
            .eq('cedula_ruc', cedulaRuc)
            .single();

        if (error && error.code !== 'PGRST116') {
            this.falloPersistencia(error, 'No se pudo buscar el cliente.');
        }
        if (error || !data) {
            throw new NotFoundException(`Cliente con identificación ${cedulaRuc} no encontrado.`);
        }
        return data;
    }

    async crearCliente(clienteData: CreateClienteDto) {
        const { data, error } = await this.supabaseService.getClient()
            .from('clientes')
            .insert([clienteData])
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                throw new ConflictException('Ya existe un cliente registrado con esa cédula o RUC.');
            }
            this.falloPersistencia(error, 'No se pudo registrar el cliente.');
        }
        return data;
    }

    async actualizar(id: string, clienteData: UpdateClienteDto) {
        const { data, error } = await this.supabaseService.getClient()
            .from('clientes')
            .update(clienteData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                throw new NotFoundException('Cliente no encontrado.');
            }
            if (error.code === '23505') {
                throw new ConflictException('Ya existe un cliente registrado con esa cédula o RUC.');
            }
            this.falloPersistencia(error, 'No se pudo actualizar el cliente.');
        }
        if (!data) {
            throw new NotFoundException('Cliente no encontrado.');
        }
        return data;
    }

    async crecimiento(desde?: string, hasta?: string) {
        const supabase = this.supabaseService.getClient();

        const { count: totalGeneral, error: errorTotal } = await supabase
            .from('clientes')
            .select('id', { count: 'exact', head: true });

        if (errorTotal) this.falloPersistencia(errorTotal, 'No se pudo contar los clientes.');

        let queryPeriodo = supabase
            .from('clientes')
            .select('id, fecha_creacion')
            .order('fecha_creacion', { ascending: true })
            .limit(5000);

        if (desde) queryPeriodo = queryPeriodo.gte('fecha_creacion', `${desde}T00:00:00.000-05:00`);
        if (hasta) queryPeriodo = queryPeriodo.lte('fecha_creacion', `${hasta}T23:59:59.999-05:00`);

        const { data, error } = await queryPeriodo;
        if (error) this.falloPersistencia(error, 'No se pudo consultar el crecimiento de clientes.');

        const altas = data ?? [];
        const porDia = new Map<string, { fecha: string; altas: number }>();
        for (const cliente of altas) {
            if (!cliente.fecha_creacion) continue;
            const fecha = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'America/Guayaquil',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
            }).format(new Date(cliente.fecha_creacion));
            const actual = porDia.get(fecha) ?? { fecha, altas: 0 };
            actual.altas += 1;
            porDia.set(fecha, actual);
        }

        return {
            total_general: totalGeneral ?? 0,
            altas_periodo: altas.length,
            por_dia: [...porDia.values()],
            meta: {
                desde: desde ?? null,
                hasta: hasta ?? null,
            },
        };
    }

    async eliminar(id: string) {
        const { data, error } = await this.supabaseService.getClient()
            .from('clientes')
            .delete()
            .eq('id', id)
            .select('id');

        if (error) {
            if (error.code === '23503') {
                throw new ConflictException('No se puede eliminar el cliente porque tiene órdenes asociadas.');
            }
            this.falloPersistencia(error, 'No se pudo eliminar el cliente.');
        }
        if (!data || data.length === 0) {
            throw new NotFoundException('Cliente no encontrado.');
        }
        return { mensaje: 'Cliente eliminado correctamente' };
    }

    private falloPersistencia(error: { code?: string; message?: string }, mensaje: string): never {
        this.logger.error(`${mensaje} [${error.code ?? 'sin-codigo'}] ${error.message ?? ''}`);
        throw new InternalServerErrorException(mensaje);
    }
}