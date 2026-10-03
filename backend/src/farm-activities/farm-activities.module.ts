import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FarmPlot } from '../farm-plots/entities/farm-plot.entity';
import { FarmActivity } from './entities/farm-activity.entity';
import { FarmActivitiesController } from './farm-activities.controller';
import { FarmActivitiesService } from './farm-activities.service';

@Module({
  imports: [TypeOrmModule.forFeature([FarmActivity, FarmPlot])],
  controllers: [FarmActivitiesController],
  providers: [FarmActivitiesService],
  exports: [FarmActivitiesService],
})
export class FarmActivitiesModule {}
