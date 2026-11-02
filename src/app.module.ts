import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from './config/supabase.module';
import { ClientesModule } from './modules/clientes/clientes.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { OrdenesModule } from './modules/ordenes/ordenes.module';
import { FacturacionModule } from './modules/facturacion/facturacion.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    SupabaseModule,
    ClientesModule,
    OrdenesModule,
    FacturacionModule,
    DashboardModule,
  ],
})
export class AppModule {}