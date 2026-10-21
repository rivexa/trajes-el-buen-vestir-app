import { Test, TestingModule } from '@nestjs/testing';
import { SupabaseService } from '../../config/supabase.service';
import { SriService } from '../sri/sri.service';
import { FacturacionService } from './facturacion.service';

describe('FacturacionService', () => {
  let service: FacturacionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FacturacionService,
        { provide: SupabaseService, useValue: { getClient: jest.fn() } },
        { provide: SriService, useValue: {} },
      ],
    }).compile();

    service = module.get<FacturacionService>(FacturacionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
