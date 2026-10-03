import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { FarmPlot } from '../farm-plots/entities/farm-plot.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FarmPlot])],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
