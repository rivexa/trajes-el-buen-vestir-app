import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from './config/supabase.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClientesModule } from './modules/clientes/clientes.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { OrdenesModule } from './modules/ordenes/ordenes.module';
import { FacturacionModule } from './modules/facturacion/facturacion.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    SupabaseModule,
    UsuariosModule,
    AuthModule,
    ClientesModule,
    OrdenesModule,
    FacturacionModule,
    DashboardModule,
  ],
})
export class AppModule {}