import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
    constructor(private readonly dashboardService: DashboardService) { }

    @Get()
    async obtenerResumen(
        @Query('desde') desde?: string,
        @Query('hasta') hasta?: string,
    ) {
        return this.dashboardService.obtenerResumen(desde, hasta);
    }
}
