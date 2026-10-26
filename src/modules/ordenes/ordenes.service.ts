import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../../config/supabase.service';
import { CreateOrdenDto } from './dto/orden.dto';

@Injectable()
export class OrdenesService {
    constructor(private readonly supabaseService: SupabaseService) { }

    async crearOrden(ordenData: CreateOrdenDto) {
        const supabase = this.supabaseService.getClient();
        const { cliente_id, fecha_entrega_estimada, abono = 0, detalles } = ordenData;

        // Calcular subtotal de la orden
        const subtotalCalculado = detalles.reduce(
            (suma, item) => suma + item.cantidad * item.precio_unitario,
            0,
        );

        // Insertar la Cabecera de la Orden
        const { data: orden, error: ordenError } = await supabase
            .from('ordenes_pedido')
            .insert([{
                cliente_id,
                fecha_entrega_estimada,
                subtotal: subtotalCalculado,
                abono
            }])
            .select()
            .single();

        if (ordenError) {
            console.error('Error al insertar cabecera de orden:', ordenError);
            throw new InternalServerErrorException('Error al registrar la orden principal.');
        }

        // Preparar e Insertar los Detalles
        const detallesParaInsertar = detalles.map((item) => ({
            orden_id: orden.id,
            tipo_item: item.tipo_item,
            descripcion: item.descripcion,
            cantidad: item.cantidad,
            precio_unitario: item.precio_unitario,
            imagen_referencia_url: item.imagen_referencia_url,
        }));

        const { error: detallesError } = await supabase
            .from('orden_detalles')
            .insert(detallesParaInsertar);

        if (detallesError) {
            console.error('Error al insertar detalles de orden:', detallesError);
            throw new InternalServerErrorException('Error al registrar los detalles de la orden.');
        }

        return {
            mensaje: 'Orden registrada exitosamente',
            orden_id: orden.id,
            subtotal: subtotalCalculado,
            abono_registrado: abono,
            saldo_pendiente: orden.saldo
        };
    }

    async obtenerOrden(id: string) {
        const supabase = this.supabaseService.getClient();

        const { data, error } = await supabase
            .from('ordenes_pedido')
            .select(`
                *,
                clientes (nombres, apellidos, cedula_ruc, telefono),
                orden_detalles (*)
            `)
            .eq('id', id)
            .single();

        if (error || !data) {
            throw new InternalServerErrorException(`No se encontró la orden o hubo un error: ${error?.message}`);
        }

        return data;
    }

    async registrarPago(id: string, nuevoPago: number) {
        const supabase = this.supabaseService.getClient();

        // Consultar el estado actual de la orden
        const { data: ordenActual, error: errorBusqueda } = await supabase
            .from('ordenes_pedido')
            .select('abono, saldo, subtotal')
            .eq('id', id)
            .single();

        if (errorBusqueda || !ordenActual) {
            throw new InternalServerErrorException('Orden no encontrada para registrar pago.');
        }

        // Validar que no pague más de lo que debe
        if (nuevoPago > ordenActual.saldo) {
            throw new InternalServerErrorException(`El pago ($${nuevoPago}) supera el saldo pendiente ($${ordenActual.saldo}).`);
        }

        // Calcular el nuevo abono acumulado
        const abonoAcumulado = ordenActual.abono + nuevoPago;

        // Actualizar la orden en la base de datos
        const { data: ordenActualizada, error: errorUpdate } = await supabase
            .from('ordenes_pedido')
            .update({ abono: abonoAcumulado })
            .eq('id', id)
            .select()
            .single();

        if (errorUpdate) {
            throw new InternalServerErrorException('Error al actualizar el abono en la base de datos.');
        }

        return {
            mensaje: 'Pago registrado exitosamente',
            pago_recibido: nuevoPago,
            nuevo_abono_total: ordenActualizada.abono,
            nuevo_saldo_pendiente: ordenActualizada.saldo
        };
    }
}