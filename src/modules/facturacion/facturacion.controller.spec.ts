import { Test, TestingModule } from '@nestjs/testing';
import { FacturacionController } from './facturacion.controller';
import { FacturacionService } from './facturacion.service';

describe('FacturacionController', () => {
  let controller: FacturacionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FacturacionController],
      providers: [{ provide: FacturacionService, useValue: {} }],
    }).compile();

    controller = module.get<FacturacionController>(FacturacionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
