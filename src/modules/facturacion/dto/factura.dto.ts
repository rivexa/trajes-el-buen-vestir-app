import { IsUUID, IsString, IsOptional, IsIn, IsArray, IsNotEmpty } from 'class-validator';

export class CreateFacturaDto {
    @IsUUID('4', { message: 'El ID del cliente debe ser un UUID válido.' })
    cliente_id: string;

    @IsOptional()
    @IsUUID('4', { message: 'El ID de la orden debe ser un UUID válido.' })
    orden_id?: string;

    @IsOptional()
    @IsString()
    @IsIn(['Efectivo', 'Transferencia', 'Tarjeta de Crédito', 'Tarjeta de Débito'])
    metodo_pago?: string;

    @IsArray()
    @IsNotEmpty({ message: 'La factura debe contener al menos un ítem.' })
    detalles: any[];
}