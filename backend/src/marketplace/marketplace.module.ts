import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketplaceService } from './marketplace.service';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceListing } from './entities/marketplace-listing.entity';
import { FarmPlot } from '../farm-plots/entities/farm-plot.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MarketplaceListing, FarmPlot])],
  controllers: [MarketplaceController],
  providers: [MarketplaceService],
  exports: [MarketplaceService],
})
export class MarketplaceModule {}
