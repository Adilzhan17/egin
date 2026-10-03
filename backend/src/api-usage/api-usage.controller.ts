import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { ApiUsageService } from './api-usage.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('api-usage')
export class ApiUsageController {
  constructor(private readonly service: ApiUsageService) {}

  @UseGuards(JwtAuthGuard)
  @Post('increment/:provider')
  async increment(@Param('provider') provider: string) {
    return this.service.increment(provider);
  }

  @UseGuards(JwtAuthGuard)
  @Get('stats')
  async getStats() {
    return this.service.getStats();
  }
}
