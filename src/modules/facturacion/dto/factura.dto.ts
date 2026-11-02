import { Transform, Type } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayMinSize,
    ArrayUnique,
    IsArray,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    Min,
    ValidateIf,
    ValidateNested,
} from 'class-validator';

function recortarTexto(value: unknown): unknown {
    return typeof value === 'string' ? value.trim() : value;
}

function recortarOpcional(value: unknown): unknown {
    if (typeof value !== 'string') return value;
    const recortado = value.trim();
    return recortado === '' ? undefined : recortado;
}

export class FacturaDetalleDto {
    @Transform(({ value }) => recortarTexto(value))
    @IsString()
    @IsNotEmpty({ message: 'La descripción es obligatoria.' })
    @MaxLength(300, { message: 'La descripción no puede superar los 300 caracteres.' })
    descripcion: string;

    @Type(() => Number)
    @IsInt({ message: 'La cantidad debe ser un número entero.' })
    @Min(1, { message: 'La cantidad debe ser al menos 1.' })
    cantidad: number;

    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El precio unitario no puede tener más de 2 decimales.' })
    @Min(0, { message: 'El precio unitario no puede ser negativo.' })
    precio_unitario: number;
}

export class CreateFacturaDto {
    @IsUUID(undefined, { message: 'El ID del cliente debe ser un UUID válido.' })
    cliente_id: string;

    @Transform(({ value }) => recortarOpcional(value))
    @IsOptional()
    @IsUUID(undefined, { message: 'El ID de la orden debe ser un UUID válido.' })
    orden_id?: string;

    @IsOptional()
    @IsArray({ message: 'Las órdenes deben enviarse en una lista.' })
    @ArrayMaxSize(20, { message: 'La factura no puede asociar más de 20 órdenes.' })
    @ArrayUnique({ message: 'Hay órdenes repetidas en la factura.' })
    @IsUUID(undefined, { each: true, message: 'Cada orden_id debe ser un UUID válido.' })
    orden_ids?: string[];

    @Transform(({ value }) => recortarOpcional(value))
    @IsOptional()
    @IsIn(['Efectivo', 'Transferencia', 'Tarjeta de Crédito', 'Tarjeta de Débito'], {
        message: 'El método de pago no es válido.',
    })
    metodo_pago?: string;

    @ValidateIf((factura: CreateFacturaDto) => !factura.orden_id && !factura.orden_ids?.length)
    @IsArray({ message: 'Los detalles deben enviarse en una lista.' })
    @ArrayMinSize(1, { message: 'La factura debe contener al menos un ítem.' })
    @ArrayMaxSize(50, { message: 'La factura no puede tener más de 50 ítems.' })
    @ValidateNested({ each: true })
    @Type(() => FacturaDetalleDto)
    detalles?: FacturaDetalleDto[];
}
