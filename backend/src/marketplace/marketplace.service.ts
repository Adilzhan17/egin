import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FarmPlot } from '../farm-plots/entities/farm-plot.entity';
import {
  ListingRecommendationStatus,
  ListingStatus,
  ListingVisibilityStatus,
  MarketplaceListing,
} from './entities/marketplace-listing.entity';
import { CreateListingDto, UpdateListingDto } from './dto/create-listing.dto';

type CompetitionLevel = 'low' | 'medium' | 'high';

type SellerTrust = {
  score: number;
  dealsCount: number;
  reliability: 'new' | 'stable' | 'trusted';
};

@Injectable()
export class MarketplaceService {
  constructor(
    @InjectRepository(MarketplaceListing)
    private readonly listingRepository: Repository<MarketplaceListing>,
    @InjectRepository(FarmPlot)
    private readonly plotRepository: Repository<FarmPlot>,
  ) {}

  private toCompetitionLevel(score: number): CompetitionLevel {
    if (score >= 0.67) {
      return 'high';
    }

    if (score >= 0.34) {
      return 'medium';
    }

    return 'low';
  }

  private normalizeOptionalText(value?: string | null) {
    if (value === undefined) {
      return undefined;
    }

    if (value === null) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private async getBulkSellerTrust(farmerIds: string[]): Promise<Record<string, SellerTrust>> {
    if (farmerIds.length === 0) return {};

    const uniqueFarmerIds = [...new Set(farmerIds)];

    const results = await this.listingRepository
      .createQueryBuilder('listing')
      .select('listing.farmerId', 'farmerId')
      .addSelect('COUNT(*)', 'totalCount')
      .addSelect(
        `SUM(CASE WHEN listing.status = :soldStatus THEN 1 ELSE 0 END)`,
        'soldCount',
      )
      .addSelect(
        `SUM(CASE WHEN listing.status = :activeStatus THEN 1 ELSE 0 END)`,
        'activeCount',
      )
      .where('listing.farmerId IN (:...farmerIds)', { farmerIds: uniqueFarmerIds })
      .groupBy('listing.farmerId')
      .setParameters({
        soldStatus: ListingStatus.SOLD,
        activeStatus: ListingStatus.ACTIVE,
      })
      .getRawMany<{
        farmerId: string;
        totalCount: string;
        soldCount: string;
        activeCount: string;
      }>();

    const trustMap: Record<string, SellerTrust> = {};

    uniqueFarmerIds.forEach((id) => {
      const raw = results.find((r) => r.farmerId === id);
      const totalCount = Number(raw?.totalCount || 0);
      const soldCount = Number(raw?.soldCount || 0);
      const activeCount = Number(raw?.activeCount || 0);
      const scoreBase = Math.min(soldCount * 0.35 + activeCount * 0.08 + 3.5, 5);
      const score = Number(scoreBase.toFixed(1));

      let reliability: SellerTrust['reliability'] = 'new';
      if (soldCount >= 5) {
        reliability = 'trusted';
      } else if (totalCount >= 2) {
        reliability = 'stable';
      }

      trustMap[id] = {
        score,
        dealsCount: soldCount,
        reliability,
      };
    });

    return trustMap;
  }

  private mapListing(listing: MarketplaceListing, sellerTrust: SellerTrust) {
    return {
      id: listing.id,
      cropId: listing.cropId,
      category: listing.category,
      title: listing.title,
      description: listing.description,
      quantity: Number(listing.quantity),
      unit: listing.unit,
      price: Number(listing.price),
      currency: listing.currency,
      availableFrom: listing.availableFrom,
      location: listing.location,
      imageUrl: listing.imageUrl ?? null,
      deliveryAvailable: listing.deliveryAvailable,
      deliveryNotes: listing.deliveryNotes ?? null,
      freshnessDays: listing.freshnessDays ?? null,
      storageLifeDays: listing.storageLifeDays ?? null,
      storageConditions: listing.storageConditions ?? null,
      recommendedRegion: listing.recommendedRegion ?? null,
      saleModel: listing.saleModel,
      status: listing.status,
      visibilityStatus: listing.visibilityStatus,
      competitionLevel: listing.competitionLevel ?? null,
      competitionScore:
        listing.competitionScore !== null && listing.competitionScore !== undefined
          ? Number(listing.competitionScore)
          : null,
      visibilityReason: listing.visibilityReason ?? null,
      recommendationStatus: listing.recommendationStatus ?? null,
      recommendationTitle: listing.recommendationTitle ?? null,
      recommendationMessage: listing.recommendationMessage ?? null,
      recommendedActions: listing.recommendedActions ?? null,
      sellerTrust,
      farmer: listing.farmer
        ? {
            id: listing.farmer.id,
            fullName: listing.farmer.fullName,
            region: listing.farmer.region,
          }
        : undefined,
      createdAt: listing.createdAt,
      updatedAt: listing.updatedAt,
    };
  }

  private async evaluateVisibility(
    farmerId: string,
    listingInput: {
      cropId: string;
      location: string;
      freshnessDays?: number | null;
      deliveryAvailable?: boolean;
      recommendedRegion?: string | null;
      storageLifeDays?: number | null;
    },
  ) {
    const plots = await this.plotRepository.find({
      where: { userId: farmerId, cropType: listingInput.cropId },
    });

    const normalizedRecommendedRegion =
      this.normalizeOptionalText(listingInput.recommendedRegion) ??
      this.normalizeOptionalText(listingInput.location);

    if (plots.length === 0) {
      return {
        visibilityStatus: ListingVisibilityStatus.VISIBLE,
        competitionLevel: null,
        competitionScore: null,
        recommendedRegion: normalizedRecommendedRegion,
        visibilityReason:
          'Для этой культуры пока нет связанных полей у фермера. Объявление оставлено видимым до появления геоданных.',
        recommendationStatus: ListingRecommendationStatus.CAUTION,
        recommendationTitle: 'Нужно больше полевых данных',
        recommendationMessage:
          'Система не видит связанных полей по этой культуре. Публиковать можно, но точность рекомендаций пока ограничена.',
        recommendedActions: [
          'Продать сейчас',
          'Добавить поле на карту',
          'Продавать локально',
        ],
      };
    }

    const totalArea = plots.reduce(
      (sum, plot) => sum + Number(plot.areaSizeHectares || 0),
      0,
    );
    const normalizedArea = Math.min(totalArea / 200, 1);
    const normalizedPlotCount = Math.min(plots.length / 10, 1);
    const freshnessFactor = Math.min(
      Math.max(Number(listingInput.freshnessDays || 0), 0) / 14,
      1,
    );
    const storageFactor = Math.min(
      Math.max(Number(listingInput.storageLifeDays || 0), 0) / 30,
      1,
    );
    const logisticsFactor = listingInput.deliveryAvailable ? 0.12 : 0;
    const score = Number(
      Math.min(
        normalizedArea * 0.58 +
          normalizedPlotCount * 0.24 +
          (1 - freshnessFactor) * 0.1 +
          (1 - storageFactor) * 0.08 -
          logisticsFactor,
        1,
      ).toFixed(2),
    );
    const competitionLevel = this.toCompetitionLevel(score);
    const visibilityStatus = ListingVisibilityStatus.VISIBLE;

    if (competitionLevel === 'high') {
      return {
        visibilityStatus,
        competitionLevel,
        competitionScore: score,
        recommendedRegion: normalizedRecommendedRegion,
        visibilityReason:
          `По культуре "${listingInput.cropId}" высокая конкуренция. Публикацию лучше не расширять без логистического преимущества.`,
        recommendationStatus: ListingRecommendationStatus.CAUTION,
        recommendationTitle: 'Высокая конкуренция',
        recommendationMessage:
          listingInput.deliveryAvailable || (listingInput.freshnessDays ?? 0) <= 3
            ? 'Лучше продавать быстро и ближе к покупателю: короткое окно свежести и плотный рынок требуют локальной сделки.'
            : 'Лучше дробить объем, не завышать цену и искать ближайших покупателей вместо широкого охвата.',
        recommendedActions: [
          'Продавать локально',
          'Найти ближайшего покупателя',
          'Скрыть',
          'Продать сейчас',
        ],
      };
    }

    if (competitionLevel === 'medium') {
      return {
        visibilityStatus,
        competitionLevel,
        competitionScore: score,
        recommendedRegion: normalizedRecommendedRegion,
        visibilityReason:
          `По культуре "${listingInput.cropId}" конкуренция средняя. Объявление можно держать активным, если цена и логистика подтверждают спрос.`,
        recommendationStatus: ListingRecommendationStatus.HEALTHY,
        recommendationTitle: 'Рабочее окно продаж',
        recommendationMessage:
          listingInput.deliveryAvailable
            ? 'У вас есть логистическое преимущество. Можно продавать сейчас и тестировать соседние регионы.'
            : 'Лучше начать с локального спроса и постепенно расширять охват по региону.',
        recommendedActions: [
          'Продать сейчас',
          'Продавать локально',
          'Найти ближайшего покупателя',
        ],
      };
    }

    return {
      visibilityStatus,
      competitionLevel,
      competitionScore: score,
      recommendedRegion: normalizedRecommendedRegion,
      visibilityReason:
        `По культуре "${listingInput.cropId}" давление конкуренции низкое. Объявление можно продвигать активнее, если товар свежий и условия хранения понятны.`,
      recommendationStatus: ListingRecommendationStatus.HEALTHY,
      recommendationTitle: 'Низкая конкуренция',
      recommendationMessage:
        (listingInput.freshnessDays ?? 0) > 0 && (listingInput.freshnessDays ?? 0) <= 3
          ? 'Товар лучше продавать быстро: окно свежеcти короткое, поэтому приоритет за ближайшим покупателем и моментальной сделкой.'
          : 'Можно продавать сейчас и тестировать более широкий спрос без автоматического скрытия.',
      recommendedActions: [
        'Продать сейчас',
        'Найти ближайшего покупателя',
        'Продавать локально',
      ],
    };
  }

  async create(farmerId: string, createDto: CreateListingDto) {
    const visibility = await this.evaluateVisibility(farmerId, {
      cropId: createDto.cropId,
      location: createDto.location,
      freshnessDays: createDto.freshnessDays,
      deliveryAvailable: createDto.deliveryAvailable,
      recommendedRegion: createDto.recommendedRegion,
      storageLifeDays: createDto.storageLifeDays,
    });

    const listing = await this.listingRepository.save(
      this.listingRepository.create({
        ...createDto,
        ...visibility,
        farmerId,
        availableFrom: new Date(createDto.availableFrom),
        imageUrl: this.normalizeOptionalText(createDto.imageUrl) ?? null,
        deliveryAvailable: createDto.deliveryAvailable ?? false,
        deliveryNotes: this.normalizeOptionalText(createDto.deliveryNotes) ?? null,
        freshnessDays: createDto.freshnessDays ?? null,
        storageLifeDays: createDto.storageLifeDays ?? null,
        storageConditions:
          this.normalizeOptionalText(createDto.storageConditions) ?? null,
        recommendedRegion:
          visibility.recommendedRegion ??
          this.normalizeOptionalText(createDto.recommendedRegion) ??
          null,
        saleModel: createDto.saleModel?.trim() || 'lead_chat',
      }),
    );

    const withRelations = await this.listingRepository.findOne({
      where: { id: listing.id },
      relations: ['farmer'],
    });

    const trust = await this.getBulkSellerTrust([farmerId]);
    return this.mapListing(withRelations ?? listing, trust[farmerId]);
  }

  async findAll(
    category?: string,
    search?: string,
    sortBy = 'createdAt',
    sortOrder: 'ASC' | 'DESC' = 'DESC',
  ) {
    const query = this.listingRepository
      .createQueryBuilder('listing')
      .leftJoinAndSelect('listing.farmer', 'farmer');

    query.andWhere('listing.status = :status', { status: ListingStatus.ACTIVE });
    query.andWhere('listing.visibilityStatus = :visibilityStatus', {
      visibilityStatus: ListingVisibilityStatus.VISIBLE,
    });

    if (category && category !== 'Все') {
      query.andWhere('listing.category = :category', { category });
    }

    if (search) {
      query.andWhere(
        '(LOWER(listing.title) LIKE LOWER(:search) OR LOWER(listing.location) LIKE LOWER(:search) OR LOWER(listing.cropId) LIKE LOWER(:search) OR LOWER(COALESCE(listing.recommendedRegion, \'\')) LIKE LOWER(:search))',
        { search: `%${search}%` },
      );
    }

    const validSortFields = ['createdAt', 'price'];
    const actualSortBy = validSortFields.includes(sortBy)
      ? `listing.${sortBy}`
      : 'listing.createdAt';
    const actualSortOrder = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    query.orderBy(actualSortBy, actualSortOrder);

    const listings = await query.getMany();
    const farmerIds = listings.map((l) => l.farmerId);
    const trustMap = await this.getBulkSellerTrust(farmerIds);

    return listings.map((listing) =>
      this.mapListing(listing, trustMap[listing.farmerId]),
    );
  }

  async findMine(farmerId: string) {
    const listings = await this.listingRepository.find({
      where: { farmerId },
      relations: ['farmer'],
      order: { updatedAt: 'DESC' },
    });

    const trustMap = await this.getBulkSellerTrust([farmerId]);
    return listings.map((listing) =>
      this.mapListing(listing, trustMap[farmerId]),
    );
  }

  async findOne(id: string) {
    const listing = await this.listingRepository.findOne({
      where: { id },
      relations: ['farmer'],
    });
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }
    const trustMap = await this.getBulkSellerTrust([listing.farmerId]);
    return this.mapListing(listing, trustMap[listing.farmerId]);
  }

  async update(id: string, farmerId: string, updateDto: UpdateListingDto) {
    const authRecord = await this.listingRepository.findOne({
      where: { id, farmerId },
      relations: ['farmer'],
    });
    if (!authRecord) {
      throw new NotFoundException('Listing not found or not yours');
    }

    const cropId = updateDto.cropId ?? authRecord.cropId;
    const recalculatedVisibility =
      updateDto.visibilityStatus !== undefined
        ? {
            visibilityStatus: updateDto.visibilityStatus,
            competitionLevel: authRecord.competitionLevel ?? null,
            competitionScore: authRecord.competitionScore ?? null,
            recommendedRegion:
              this.normalizeOptionalText(updateDto.recommendedRegion) ??
              authRecord.recommendedRegion ??
              this.normalizeOptionalText(updateDto.location) ??
              authRecord.location,
            visibilityReason:
              'Visibility status was manually overridden by the listing owner.',
            recommendationStatus:
              authRecord.recommendationStatus ?? ListingRecommendationStatus.CAUTION,
            recommendationTitle:
              authRecord.recommendationTitle ?? 'Ручное решение владельца',
            recommendationMessage:
              authRecord.recommendationMessage ??
              'Владелец объявления вручную изменил видимость и стратегию публикации.',
            recommendedActions: authRecord.recommendedActions ?? [
              'Продать сейчас',
            ],
          }
        : await this.evaluateVisibility(farmerId, {
            cropId,
            location: updateDto.location ?? authRecord.location,
            freshnessDays: updateDto.freshnessDays ?? authRecord.freshnessDays,
            deliveryAvailable:
              updateDto.deliveryAvailable ?? authRecord.deliveryAvailable,
            recommendedRegion:
              updateDto.recommendedRegion ?? authRecord.recommendedRegion,
            storageLifeDays:
              updateDto.storageLifeDays ?? authRecord.storageLifeDays,
          });

    await this.listingRepository.update(id, {
      ...updateDto,
      ...recalculatedVisibility,
      availableFrom: updateDto.availableFrom
        ? new Date(updateDto.availableFrom)
        : undefined,
      imageUrl:
        updateDto.imageUrl !== undefined
          ? this.normalizeOptionalText(updateDto.imageUrl)
          : undefined,
      deliveryNotes:
        updateDto.deliveryNotes !== undefined
          ? this.normalizeOptionalText(updateDto.deliveryNotes)
          : undefined,
      storageConditions:
        updateDto.storageConditions !== undefined
          ? this.normalizeOptionalText(updateDto.storageConditions)
          : undefined,
      recommendedRegion:
        recalculatedVisibility.recommendedRegion !== undefined
          ? recalculatedVisibility.recommendedRegion
          : undefined,
      saleModel: updateDto.saleModel?.trim() || undefined,
    });

    return this.findOne(id);
  }

  async remove(id: string, farmerId: string) {
    const authRecord = await this.listingRepository.findOne({
      where: { id, farmerId },
    });
    if (!authRecord) {
      throw new NotFoundException('Listing not found or not yours');
    }

    await this.listingRepository.delete(id);
    return {
      id,
      deleted: true,
    };
  }
}
