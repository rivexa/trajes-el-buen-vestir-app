import { Module } from '@nestjs/common';
import { MensajeriaModule } from '../mensajeria/mensajeria.module';
import { OrdenesService } from './ordenes.service';
import { OrdenesController } from './ordenes.controller';

@Module({
  imports: [MensajeriaModule],
  providers: [OrdenesService],
  controllers: [OrdenesController],
})
export class OrdenesModule {}
