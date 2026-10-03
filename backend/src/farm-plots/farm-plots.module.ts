import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FarmPlotsService } from './farm-plots.service';
import { FarmPlotsController } from './farm-plots.controller';
import { FarmPlot } from './entities/farm-plot.entity';
import { FarmActivity } from '../farm-activities/entities/farm-activity.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FarmPlot, FarmActivity])],
  controllers: [FarmPlotsController],
  providers: [FarmPlotsService],
  exports: [FarmPlotsService]
})
export class FarmPlotsModule {}
