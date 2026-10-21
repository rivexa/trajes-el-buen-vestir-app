import { Test, TestingModule } from '@nestjs/testing';
import { SupabaseService } from '../../config/supabase.service';
import { OrdenesService } from './ordenes.service';

describe('OrdenesService', () => {
  let service: OrdenesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdenesService,
        { provide: SupabaseService, useValue: { getClient: jest.fn() } },
      ],
    }).compile();

    service = module.get<OrdenesService>(OrdenesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
