import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  FarmPlot,
  PlantingStatus,
} from '../farm-plots/entities/farm-plot.entity';
import {
  ListingRecommendationStatus,
  ListingStatus,
  ListingVisibilityStatus,
  MarketplaceListing,
} from '../marketplace/entities/marketplace-listing.entity';
import { Order, OrderItem, OrderStatus } from '../orders/entities/order.entity';
import {
  ServiceCategory,
  ServiceListing,
} from '../services/entities/service-listing.entity';
import { UserRole } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';

type DemoPlotInput = {
  title: string;
  region: string;
  district: string;
  village: string;
  areaSizeHectares: number;
  cropType: string;
  fillColor: string;
  plantingDate: string;
  plantingStatus: PlantingStatus;
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
};

@Injectable()
export class DemoBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DemoBootstrapService.name);

  constructor(
    private readonly usersService: UsersService,
    @InjectRepository(FarmPlot)
    private readonly plotRepository: Repository<FarmPlot>,
    @InjectRepository(MarketplaceListing)
    private readonly marketplaceRepository: Repository<MarketplaceListing>,
    @InjectRepository(ServiceListing)
    private readonly serviceRepository: Repository<ServiceListing>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
  ) {}

  async onApplicationBootstrap() {
    if (process.env.DEMO_ACCOUNTS_ENABLED?.trim().toLowerCase() !== 'true') {
      this.logger.log('Demo bootstrap skipped: DEMO_ACCOUNTS_ENABLED is false');
      return;
    }

    const password = process.env.DEMO_PASSWORD?.trim() || 'demo123';
    const currentYear = new Date().getFullYear();

    const [farmer, seller, buyer] = await Promise.all([
      this.usersService.ensureUser({
        phone: process.env.DEMO_FARMER_PHONE?.trim() || '+77010000001',
        password,
        fullName: 'Demo Farmer',
        role: UserRole.FARMER,
        region: 'Алматинская область',
        district: 'Талгар',
      }),
      this.usersService.ensureUser({
        phone: process.env.DEMO_SELLER_PHONE?.trim() || '+77010000002',
        password,
        fullName: 'Demo Service Seller',
        role: UserRole.SELLER,
        region: 'Алматинская область',
        district: 'Талгар',
      }),
      this.usersService.ensureUser({
        phone: process.env.DEMO_BUYER_PHONE?.trim() || '+77010000003',
        password,
        fullName: 'Demo Buyer',
        role: UserRole.BUYER,
        region: 'Алматинская область',
        district: 'Талгар',
      }),
    ]);

    const farmerPlots = await Promise.all([
      this.upsertPlot(farmer.id, currentYear, {
        title: 'Орёл 22',
        region: 'Алматинская область',
        district: 'Талгар',
        village: 'Бесагаш',
        areaSizeHectares: 12.4,
        cropType: 'Пшеница',
        fillColor: '#B89B45',
        plantingDate: `${currentYear}-03-12`,
        plantingStatus: PlantingStatus.PLANTED,
        geometry: this.buildPolygon(77.245, 43.285, 0.012),
      }),
      this.upsertPlot(farmer.id, currentYear, {
        title: 'Нуреке жери 2',
        region: 'Алматинская область',
        district: 'Талгар',
        village: 'Панфилово',
        areaSizeHectares: 4.8,
        cropType: 'Арбуз',
        fillColor: '#67B44A',
        plantingDate: `${currentYear}-04-04`,
        plantingStatus: PlantingStatus.PLANTED,
        geometry: this.buildPolygon(77.301, 43.272, 0.008),
      }),
    ]);

    const wheatPlot = farmerPlots.find((plot) => plot.cropType === 'Пшеница');
    const watermelonPlot = farmerPlots.find((plot) => plot.cropType === 'Арбуз');

    const [marketWheat, marketWatermelon] = await Promise.all([
      this.upsertMarketplaceListing({
        farmerId: farmer.id,
        cropId: wheatPlot?.cropType || 'Пшеница',
        category: 'Зерновые',
        title: 'Пшеница 3 класс, 18 тонн',
        description:
          'Готова к отгрузке. Есть доставка по Талгару и соседним районам. Подходит для быстрой проверки lead-based сценария.',
        quantity: 18,
        unit: 'тонн',
        price: 98000,
        location: 'Талгар',
        availableFrom: `${currentYear}-07-10`,
        imageUrl: 'https://placehold.co/800x600?text=Wheat',
        deliveryAvailable: true,
        deliveryNotes: 'Доставка в течение 24 часов',
        freshnessDays: 14,
        storageLifeDays: 180,
        storageConditions: 'Сухой склад, влажность до 14%',
        recommendedRegion: 'Алматинская область',
        saleModel: 'lead_chat',
        status: ListingStatus.ACTIVE,
        visibilityStatus: ListingVisibilityStatus.VISIBLE,
        competitionLevel: 'medium',
        competitionScore: 0.46,
        visibilityReason: 'Рабочее окно продаж для локального рынка.',
        recommendationStatus: ListingRecommendationStatus.HEALTHY,
        recommendationTitle: 'Можно продавать сейчас',
        recommendationMessage:
          'Локальный спрос достаточный. Держите объявление активным и ведите сделки через чат.',
        recommendedActions: [
          'Продать сейчас',
          'Продавать локально',
          'Найти ближайшего покупателя',
        ],
      }),
      this.upsertMarketplaceListing({
        farmerId: farmer.id,
        cropId: watermelonPlot?.cropType || 'Арбуз',
        category: 'Овощи и бахчевые',
        title: 'Арбуз свежий, 6 тонн',
        description:
          'Короткое окно свежести, приоритет на ближайших покупателей. Хороший сценарий для проверки рекомендаций и прямого чата.',
        quantity: 6,
        unit: 'тонн',
        price: 72000,
        location: 'Панфилово',
        availableFrom: `${currentYear}-07-18`,
        imageUrl: 'https://placehold.co/800x600?text=Watermelon',
        deliveryAvailable: false,
        deliveryNotes: 'Самовывоз',
        freshnessDays: 4,
        storageLifeDays: 10,
        storageConditions: 'Тень, проветриваемое хранение',
        recommendedRegion: 'Алматинская область',
        saleModel: 'lead_chat',
        status: ListingStatus.SOLD,
        visibilityStatus: ListingVisibilityStatus.VISIBLE,
        competitionLevel: 'high',
        competitionScore: 0.71,
        visibilityReason: 'Высокая конкуренция, но товар уже закрыт в сделку.',
        recommendationStatus: ListingRecommendationStatus.CAUTION,
        recommendationTitle: 'Лучше продавать локально',
        recommendationMessage:
          'Свежесть ограничена, поэтому сценарий локального buyer match самый реалистичный.',
        recommendedActions: [
          'Продавать локально',
          'Найти ближайшего покупателя',
          'Скрыть',
        ],
      }),
    ]);

    const [serviceMachinery, serviceAgronomist] = await Promise.all([
      this.upsertServiceListing({
        providerUserId: seller.id,
        category: ServiceCategory.MACHINERY_RENTAL,
        title: 'Аренда трактора с механизатором',
        description:
          'Техника для вспашки и подготовки поля. Подходит для проверки каталога услуг, профиля поставщика и чата.',
        priceFrom: 18000,
        urgentAvailable: true,
        availability: 'tomorrow',
        serviceArea: 'Талгар, Есик, Бесагаш',
        responseSlaHours: 2,
        country: 'Казахстан',
        region: 'Алматинская область',
        district: 'Талгар',
        locality: 'Талгар',
        rating: 4.8,
        reviewsCount: 16,
        completedJobs: 42,
        imageUrl: 'https://placehold.co/800x600?text=Tractor',
      }),
      this.upsertServiceListing({
        providerUserId: seller.id,
        category: ServiceCategory.AGRONOMIST,
        title: 'Агроном на выезд по полю',
        description:
          'Осмотр культуры, базовые риски и рекомендации по подкормке. Удобно для проверки provider cabinet и карточки услуги.',
        priceFrom: 25000,
        urgentAvailable: false,
        availability: 'this_week',
        serviceArea: 'Талгарский район',
        responseSlaHours: 6,
        country: 'Казахстан',
        region: 'Алматинская область',
        district: 'Талгар',
        locality: 'Бесагаш',
        rating: 4.9,
        reviewsCount: 11,
        completedJobs: 28,
        imageUrl: 'https://placehold.co/800x600?text=Agronomist',
      }),
    ]);

    await Promise.all([
      this.ensureOrders(
        farmer.id,
        [
          {
            status: OrderStatus.COMPLETED,
            items: [
              {
                listingId: serviceMachinery.id,
                title: 'Аренда трактора с механизатором',
                quantity: 1,
                unit: 'смена',
                priceAtPurchase: 18000,
              },
            ],
          },
          {
            status: OrderStatus.PENDING,
            items: [
              {
                listingId: serviceAgronomist.id,
                title: 'Агроном на выезд по полю',
                quantity: 1,
                unit: 'выезд',
                priceAtPurchase: 25000,
              },
            ],
          },
        ],
      ),
      this.ensureOrders(
        buyer.id,
        [
          {
            status: OrderStatus.COMPLETED,
            items: [
              {
                listingId: marketWheat.id,
                title: 'Пшеница 3 класс, 18 тонн',
                quantity: 5,
                unit: 'тонн',
                priceAtPurchase: 98000,
              },
            ],
          },
          {
            status: OrderStatus.COMPLETED,
            items: [
              {
                listingId: marketWatermelon.id,
                title: 'Арбуз свежий, 6 тонн',
                quantity: 2,
                unit: 'тонн',
                priceAtPurchase: 72000,
              },
            ],
          },
        ],
      ),
      this.ensureOrders(
        seller.id,
        [
          {
            status: OrderStatus.COMPLETED,
            items: [
              {
                listingId: serviceAgronomist.id,
                title: 'Консультация по сезону',
                quantity: 1,
                unit: 'заказ',
                priceAtPurchase: 30000,
              },
            ],
          },
        ],
      ),
    ]);

    this.logger.log('Demo accounts are ready for farmer, seller and buyer');
    this.logger.log(
      `Farmer: ${farmer.phone}, Seller: ${seller.phone}, Buyer: ${buyer.phone}`,
    );
  }

  private buildPolygon(centerLng: number, centerLat: number, size: number) {
    return {
      type: 'Polygon' as const,
      coordinates: [[
        [centerLng - size, centerLat - size],
        [centerLng + size, centerLat - size],
        [centerLng + size, centerLat + size],
        [centerLng - size, centerLat + size],
        [centerLng - size, centerLat - size],
      ]],
    };
  }

  private async upsertPlot(
    userId: string,
    seasonYear: number,
    input: DemoPlotInput,
  ) {
    const existing = await this.plotRepository.findOne({
      where: { userId, title: input.title },
    });

    const saved = await this.plotRepository.save(
      this.plotRepository.create({
        ...existing,
        userId,
        title: input.title,
        region: input.region,
        district: input.district,
        village: input.village,
        areaSizeHectares: input.areaSizeHectares,
        geometry: null,
        cropType: input.cropType,
        fillColor: input.fillColor,
        seasonYear,
        plantingDate: new Date(input.plantingDate),
        plantingStatus: input.plantingStatus,
      }),
    );

    await this.plotRepository.query(
      `
        UPDATE farm_plots
        SET geometry = ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)
        WHERE id = $2
      `,
      [JSON.stringify(input.geometry), saved.id],
    );

    return this.plotRepository.findOneByOrFail({ id: saved.id });
  }

  private async upsertMarketplaceListing(input: {
    farmerId: string;
    cropId: string;
    category: string;
    title: string;
    description: string;
    quantity: number;
    unit: string;
    price: number;
    location: string;
    availableFrom: string;
    imageUrl: string | null;
    deliveryAvailable: boolean;
    deliveryNotes: string | null;
    freshnessDays: number | null;
    storageLifeDays: number | null;
    storageConditions: string | null;
    recommendedRegion: string | null;
    saleModel: string;
    status: ListingStatus;
    visibilityStatus: ListingVisibilityStatus;
    competitionLevel: string | null;
    competitionScore: number | null;
    visibilityReason: string | null;
    recommendationStatus: ListingRecommendationStatus | null;
    recommendationTitle: string | null;
    recommendationMessage: string | null;
    recommendedActions: string[] | null;
  }) {
    const existing = await this.marketplaceRepository.findOne({
      where: { farmerId: input.farmerId, title: input.title },
    });

    return this.marketplaceRepository.save(
      this.marketplaceRepository.create({
        ...existing,
        ...input,
        availableFrom: new Date(input.availableFrom),
      }),
    );
  }

  private async upsertServiceListing(input: {
    providerUserId: string;
    category: ServiceCategory;
    title: string;
    description: string;
    priceFrom: number;
    urgentAvailable: boolean;
    availability: string;
    serviceArea: string;
    responseSlaHours: number;
    country: string;
    region: string;
    district: string;
    locality: string;
    rating: number;
    reviewsCount: number;
    completedJobs: number;
    imageUrl: string | null;
  }) {
    const existing = await this.serviceRepository.findOne({
      where: { providerUserId: input.providerUserId, title: input.title },
    });

    return this.serviceRepository.save(
      this.serviceRepository.create({
        ...existing,
        ...input,
        currency: 'KZT',
        isActive: true,
      }),
    );
  }

  private async ensureOrders(
    userId: string,
    orders: Array<{
      status: OrderStatus;
      items: Array<{
        listingId: string;
        title: string;
        quantity: number;
        unit: string;
        priceAtPurchase: number;
      }>;
    }>,
  ) {
    const existingCount = await this.orderRepository.count({
      where: { userId },
    });

    if (existingCount > 0) {
      return;
    }

    for (const orderInput of orders) {
      const totalPrice = orderInput.items.reduce(
        (sum, item) => sum + item.quantity * item.priceAtPurchase,
        0,
      );

      await this.orderRepository.save(
        this.orderRepository.create({
          userId,
          status: orderInput.status,
          totalPrice,
          items: orderInput.items.map((item) =>
            this.orderItemRepository.create(item),
          ),
        }),
      );
    }
  }
}
