import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@Controller('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Return mobile home dashboard summary for the current user (default route).' })
  async getDashboard(@Req() req: { user: { id: string } }) {
    const data = await this.dashboardService.getHomeDashboard(req.user.id);
    return { success: true, data };
  }

  @Get('home')
  @ApiOperation({ summary: 'Return mobile home dashboard summary for the current user.' })
  async getHome(@Req() req: { user: { id: string } }) {
    const data = await this.dashboardService.getHomeDashboard(req.user.id);
    return { success: true, data };
  }

  @Get('notifications')
  @ApiOperation({ summary: 'Return dashboard notifications for the current user.' })
  async getNotifications(@Req() req: { user: { id: string } }) {
    const data = await this.dashboardService.getNotifications(req.user.id);
    return { success: true, data };
  }

  @Get('insights')
  @ApiOperation({ summary: 'Return explainable AI-style insights for the current user.' })
  async getInsights(@Req() req: { user: { id: string } }) {
    const data = await this.dashboardService.getInsights(req.user.id);
    return { success: true, data };
  }
}
