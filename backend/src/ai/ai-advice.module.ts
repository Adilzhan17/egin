import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FarmActivity } from '../farm-activities/entities/farm-activity.entity';
import { FarmPlot } from '../farm-plots/entities/farm-plot.entity';
import { WeatherModule } from '../weather/weather.module';
import {
  AiAdviceController,
  PlotConditionsController,
} from './ai-advice.controller';
import { AiAdviceService } from './ai-advice.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([FarmPlot, FarmActivity]),
    WeatherModule,
  ],
  controllers: [AiAdviceController, PlotConditionsController],
  providers: [AiAdviceService],
})
export class AiAdviceModule {}
