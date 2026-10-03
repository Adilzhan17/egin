import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Order, OrderItem } from './entities/order.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListingStatus, MarketplaceListing } from '../marketplace/entities/marketplace-listing.entity';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    @InjectRepository(MarketplaceListing)
    private readonly listingRepository: Repository<MarketplaceListing>,
  ) {}

  async create(userId: string, dto: CreateOrderDto): Promise<Order> {
    const ids = [...new Set(dto.items.map((item) => item.listingId))];
    const listings = await this.listingRepository.find({ where: { id: In(ids) } });
    const byId = new Map(listings.map((listing) => [listing.id, listing]));

    const items = dto.items.map((item) => {
      const listing = byId.get(item.listingId);
      if (!listing) throw new NotFoundException(`Listing ${item.listingId} not found`);
      if (listing.status !== ListingStatus.ACTIVE) {
        throw new BadRequestException(`Listing ${listing.id} is not available`);
      }
      if (listing.farmerId === userId) {
        throw new BadRequestException('You cannot order your own listing');
      }
      if (item.quantity > Number(listing.quantity)) {
        throw new BadRequestException(`Requested quantity exceeds what is available for ${listing.id}`);
      }
      return this.orderItemRepository.create({
        listingId: listing.id,
        title: listing.title,
        unit: listing.unit,
        quantity: item.quantity,
        priceAtPurchase: Number(listing.price),
      });
    });

    const totalPrice = Number(
      items.reduce((sum, item) => sum + item.priceAtPurchase * item.quantity, 0).toFixed(2),
    );

    return this.orderRepository.save(this.orderRepository.create({ userId, totalPrice, items }));
  }

  async findByUser(userId: string): Promise<Order[]> {
    return this.orderRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }
}
