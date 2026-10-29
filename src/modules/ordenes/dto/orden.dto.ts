import { Transform, Type } from 'class-transformer';
import { OmitType } from '@nestjs/swagger';
import { subtotalDetalles } from '../ordenes.dinero';
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsDateString,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    IsUrl,
    IsUUID,
    MaxLength,
    Min,
    Validate,
    ValidateNested,
    ValidationArguments,
    ValidatorConstraint,
    ValidatorConstraintInterface,
} from 'class-validator';

function recortarTexto(value: unknown): unknown {
    return typeof value === 'string' ? value.trim() : value;
}

function recortarOpcional(value: unknown): unknown {
    if (typeof value !== 'string') return value;
    const recortado = value.trim();
    return recortado === '' ? undefined : recortado;
}

@ValidatorConstraint({ name: 'abonoNoSuperaSubtotal', async: false })
export class AbonoNoSuperaSubtotal implements ValidatorConstraintInterface {
    validate(abono: number, args: ValidationArguments) {
        const orden = args.object as CreateOrdenDto;
        if (!Array.isArray(orden.detalles) || abono == null) return true;
        const lineas = orden.detalles
            .map((item) => ({
                cantidad: Number(item.cantidad),
                precio_unitario: Number(item.precio_unitario),
            }))
            .filter((item) => Number.isFinite(item.cantidad) && Number.isFinite(item.precio_unitario));
        return abono <= subtotalDetalles(lineas);
    }

    defaultMessage() {
        return 'El abono no puede ser mayor que el subtotal de la orden.';
    }
}

export class OrdenDetalleDto {
    @Transform(({ value }) => recortarTexto(value))
    @IsString()
    @IsNotEmpty({ message: 'El tipo de ítem es obligatorio.' })
    @MaxLength(40, { message: 'El tipo de ítem no puede superar los 40 caracteres.' })
    tipo_item: string;

    @Transform(({ value }) => recortarTexto(value))
    @IsString()
    @IsNotEmpty({ message: 'La descripción es obligatoria.' })
    @MaxLength(200, { message: 'La descripción no puede superar los 200 caracteres.' })
    descripcion: string;

    @Type(() => Number)
    @IsInt({ message: 'La cantidad debe ser un número entero.' })
    @Min(1, { message: 'La cantidad debe ser al menos 1.' })
    cantidad: number;

    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El precio unitario no puede tener más de 2 decimales.' })
    @Min(0, { message: 'El precio unitario no puede ser negativo.' })
    precio_unitario: number;

    @Transform(({ value }) => recortarOpcional(value))
    @IsOptional()
    @IsUrl(
        { protocols: ['http', 'https'], require_protocol: true },
        { message: 'La imagen de referencia debe ser una URL http o https.' },
    )
    imagen_referencia_url?: string;
}

export class CreateOrdenDto {
    @IsUUID(undefined, { message: 'El cliente_id debe ser un UUID válido.' })
    cliente_id: string;

    @Transform(({ value }) => recortarOpcional(value))
    @IsOptional()
    @IsDateString({}, { message: 'La fecha de entrega estimada no es válida.' })
    fecha_entrega_estimada?: string;

    @Type(() => Number)
    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El abono no puede tener más de 2 decimales.' })
    @Min(0, { message: 'El abono no puede ser negativo.' })
    @Validate(AbonoNoSuperaSubtotal)
    abono?: number;

    @IsArray({ message: 'Los detalles deben enviarse en una lista.' })
    @ArrayMinSize(1, { message: 'La orden debe incluir al menos un detalle.' })
    @ArrayMaxSize(50, { message: 'La orden no puede tener más de 50 detalles.' })
    @ValidateNested({ each: true })
    @Type(() => OrdenDetalleDto)
    detalles: OrdenDetalleDto[];
}

export class UpdateOrdenDto extends OmitType(CreateOrdenDto, ['cliente_id', 'abono'] as const) {}

export class RegistrarPagoDto {
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El monto no puede tener más de 2 decimales.' })
    @Min(0.01, { message: 'El monto del pago debe ser mayor a 0.' })
    monto: number;
}

export const ESTADOS_PRODUCCION = [
    'Pendiente',
    'En Confección',
    'Listo para Prueba',
    'Entregado',
] as const;

export type EstadoProduccion = (typeof ESTADOS_PRODUCCION)[number];

export function esEstadoProduccion(valor: string): valor is EstadoProduccion {
    return (ESTADOS_PRODUCCION as readonly string[]).includes(valor);
}

export class ActualizarEstadoOrdenDto {
    @Transform(({ value }) => recortarTexto(value))
    @IsIn([...ESTADOS_PRODUCCION], {
        message: 'El estado proporcionado no es válido para el flujo de producción.',
    })
    estado: EstadoProduccion;
}
