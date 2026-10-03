import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('region/:region')
  @ApiOperation({ summary: 'Get total hectares and farm count by crop type for a specific region' })
  getRegionStats(@Param('region') region: string) {
    return this.analyticsService.getRegionStats(region);
  }

  @Get('overproduction-risk')
  @ApiOperation({ summary: 'Calculate risk level of planting a certain crop at specific coordinates' })
  @ApiQuery({ name: 'lat', type: Number })
  @ApiQuery({ name: 'lng', type: Number })
  @ApiQuery({ name: 'cropType', type: String })
  @ApiQuery({ name: 'radiusKm', type: Number, required: false, description: 'Default 50km' })
  getRisk(
    @Query('lat') lat: number,
    @Query('lng') lng: number,
    @Query('cropType') cropType: string,
    @Query('radiusKm') radiusKm?: number
  ) {
    return this.analyticsService.getOverproductionRisk(lat, lng, cropType, radiusKm);
  }

  @Get('crop-density')
  @ApiOperation({ summary: 'Returns crop types and their total planted hectares in a radius from center' })
  @ApiQuery({ name: 'lat', type: Number })
  @ApiQuery({ name: 'lng', type: Number })
  @ApiQuery({ name: 'radiusKm', type: Number, required: false, description: 'Default 50km' })
  getCropDensity(
    @Query('lat') lat: number,
    @Query('lng') lng: number,
    @Query('radiusKm') radiusKm?: number
  ) {
    return this.analyticsService.getCropDensity(lat, lng, radiusKm);
  }
}
