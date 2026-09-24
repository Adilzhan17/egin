import { Module } from '@nestjs/common';
import { WeatherController } from './weather.controller';
import { WeatherService } from './weather.service';
import { GardenConditionsService } from './garden-conditions.service';
import { PlaceSearchController } from './place-search.controller';
import { PlaceSearchService } from './place-search.service';

@Module({
  controllers: [WeatherController, PlaceSearchController],
  providers: [WeatherService, GardenConditionsService, PlaceSearchService],
  exports: [WeatherService, GardenConditionsService],
})
export class WeatherModule {}
