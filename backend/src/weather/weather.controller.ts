import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { WeatherService } from './weather.service';

@ApiTags('Weather')
@Controller('weather')
export class WeatherController {
  constructor(private readonly weatherService: WeatherService) {}

  @Get()
  @ApiOperation({ summary: 'Return current weather for the given coordinates (default route).' })
  @ApiQuery({ name: 'lat', type: Number })
  @ApiQuery({ name: 'lng', type: Number, required: false })
  @ApiQuery({ name: 'lon', type: Number, required: false })
  async getWeather(
    @Query('lat') lat: string,
    @Query('lng') lng?: string,
    @Query('lon') lon?: string,
  ) {
    const longitude = lng || lon;
    if (!longitude) {
      return {
        success: false,
        message: 'Missing required parameter: lng or lon',
      };
    }
    return {
      success: true,
      data: await this.weatherService.getCurrent(Number(lat), Number(longitude)),
    };
  }

  @Get('current')
  @ApiOperation({ summary: 'Return current weather contract for the given coordinates.' })
  @ApiQuery({ name: 'lat', type: Number })
  @ApiQuery({ name: 'lng', type: Number })
  async getCurrent(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
  ) {
    return {
      success: true,
      data: await this.weatherService.getCurrent(Number(lat), Number(lng)),
    };
  }

  @Get('forecast')
  @ApiOperation({ summary: 'Return 1-14 day forecast contract for the given coordinates.' })
  @ApiQuery({ name: 'lat', type: Number })
  @ApiQuery({ name: 'lng', type: Number })
  @ApiQuery({ name: 'days', type: Number, required: false })
  async getForecast(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('days') days?: string,
  ) {
    return {
      success: true,
      data: await this.weatherService.getForecast(
        Number(lat),
        Number(lng),
        Number(days || 7),
      ),
    };
  }

  @Get('alerts')
  @ApiOperation({ summary: 'Return agricultural alerts for a region and district.' })
  @ApiQuery({ name: 'region', type: String, required: false })
  @ApiQuery({ name: 'district', type: String, required: false })
  async getAlerts(
    @Query('region') region?: string,
    @Query('district') district?: string,
  ) {
    return {
      success: true,
      data: await this.weatherService.getAlerts(region, district),
    };
  }
}
