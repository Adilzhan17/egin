import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FarmPlot } from '../farm-plots/entities/farm-plot.entity';
import { MarketplaceListing } from '../marketplace/entities/marketplace-listing.entity';
import { Order, OrderItem } from '../orders/entities/order.entity';
import { ServiceListing } from '../services/entities/service-listing.entity';
import { UsersModule } from '../users/users.module';
import { DemoBootstrapService } from './demo-bootstrap.service';

@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([
      FarmPlot,
      MarketplaceListing,
      ServiceListing,
      Order,
      OrderItem,
    ]),
  ],
  providers: [DemoBootstrapService],
})
export class DemoDataModule {}
