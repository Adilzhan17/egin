import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FarmPlot } from '../farm-plots/entities/farm-plot.entity';
import { MarketplaceListing } from '../marketplace/entities/marketplace-listing.entity';
import { User } from '../users/entities/user.entity';
import { InfoCenterModule } from '../info-center/info-center.module';
import { WeatherModule } from '../weather/weather.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([FarmPlot, MarketplaceListing, User]),
    WeatherModule,
    InfoCenterModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
