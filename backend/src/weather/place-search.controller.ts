import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlaceSearchService } from './place-search.service';

@Controller('places')
@UseGuards(JwtAuthGuard)
export class PlaceSearchController {
  constructor(private readonly searchService: PlaceSearchService) {}

  @Get('search')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async search(@Query('q') query: string, @Query('language') language = 'ru') {
    return {
      success: true,
      data: await this.searchService.search(query, language),
    };
  }
}
