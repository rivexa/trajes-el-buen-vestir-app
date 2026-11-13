import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
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
