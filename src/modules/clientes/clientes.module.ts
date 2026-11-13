import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClientesService } from './clientes.service';
import { ClientesController } from './clientes.controller';

@Module({
  imports: [AuthModule],
  providers: [ClientesService],
  controllers: [ClientesController],
  exports: [ClientesService]
})
export class ClientesModule {}
