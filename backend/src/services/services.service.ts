import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import {
  CreateServiceDto,
  UpdateServiceDto,
} from './dto/create-service.dto';
import { ServiceCategory, ServiceListing } from './entities/service-listing.entity';

type ServiceFilters = {
  category?: string;
  region?: string;
  district?: string;
  urgent?: string;
};

type ProviderStats = {
  activeServices: number;
  totalReviews: number;
  totalCompletedJobs: number;
  averageRating: number;
};

@Injectable()
export class ServicesService {
  constructor(
    @InjectRepository(ServiceListing)
    private readonly serviceRepository: Repository<ServiceListing>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  private buildCategoryLabel(category: ServiceCategory) {
    switch (category) {
      case ServiceCategory.MACHINERY_RENTAL:
        return 'Аренда техники';
      case ServiceCategory.PLOWING:
        return 'Вспашка';
      case ServiceCategory.SOWING:
        return 'Посев';
      case ServiceCategory.FERTILIZER:
        return 'Удобрения';
      case ServiceCategory.DELIVERY:
        return 'Доставка';
      case ServiceCategory.STORAGE:
        return 'Склад';
      case ServiceCategory.AGRONOMIST:
        return 'Агроном';
      case ServiceCategory.LABOR:
        return 'Рабочая сила';
      case ServiceCategory.IRRIGATION:
        return 'Полив';
      case ServiceCategory.REPAIR:
        return 'Ремонт техники';
      default:
        return 'Услуги';
    }
  }

  private async getProviderStatsMap(providerIds: string[]) {
    if (providerIds.length === 0) {
      return new Map<string, ProviderStats>();
    }

    const raw = await this.serviceRepository
      .createQueryBuilder('service')
      .select('service.providerUserId', 'providerUserId')
      .addSelect(
        'SUM(CASE WHEN service.isActive = true THEN 1 ELSE 0 END)',
        'activeServices',
      )
      .addSelect('SUM(service.reviewsCount)', 'totalReviews')
      .addSelect('SUM(service.completedJobs)', 'totalCompletedJobs')
      .addSelect('AVG(service.rating)', 'averageRating')
      .where('service.providerUserId IN (:...providerIds)', { providerIds })
      .groupBy('service.providerUserId')
      .getRawMany<{
        providerUserId: string;
        activeServices: string;
        totalReviews: string;
        totalCompletedJobs: string;
        averageRating: string;
      }>();

    return new Map(
      raw.map((row) => [
        row.providerUserId,
        {
          activeServices: Number(row.activeServices || 0),
          totalReviews: Number(row.totalReviews || 0),
          totalCompletedJobs: Number(row.totalCompletedJobs || 0),
          averageRating: Number(Number(row.averageRating || 0).toFixed(1)),
        },
      ]),
    );
  }

  private mapService(
    service: ServiceListing,
    providerStats?: ProviderStats,
    includeOwnerMeta = false,
  ) {
    return {
      id: service.id,
      category: service.category,
      categoryLabel: this.buildCategoryLabel(service.category),
      title: service.title,
      description: service.description,
      priceFrom: Number(service.priceFrom),
      currency: service.currency,
      urgentAvailable: service.urgentAvailable,
      availability: service.availability,
      serviceArea: service.serviceArea,
      responseSlaHours: service.responseSlaHours,
      isActive: service.isActive,
      country: service.country,
      region: service.region,
      district: service.district,
      locality: service.locality,
      rating: Number(service.rating),
      reviewsCount: service.reviewsCount,
      completedJobs: service.completedJobs,
      imageUrl: service.imageUrl,
      provider: {
        id: service.providerUserId,
        fullName: service.providerUser?.fullName ?? 'Service Provider',
        region: service.providerUser?.region ?? service.region,
        district: service.providerUser?.district ?? service.district,
        stats: providerStats ?? {
          activeServices: service.isActive ? 1 : 0,
          totalReviews: service.reviewsCount,
          totalCompletedJobs: service.completedJobs,
          averageRating: Number(service.rating),
        },
      },
      ...(includeOwnerMeta
        ? {
            createdAt: service.createdAt,
            updatedAt: service.updatedAt,
          }
        : {}),
    };
  }

  private async getOwnedServiceOrFail(id: string, userId: string) {
    const service = await this.serviceRepository.findOne({
      where: { id },
      relations: ['providerUser'],
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    if (service.providerUserId !== userId) {
      throw new ForbiddenException('You can manage only your own services');
    }

    return service;
  }

  async getCategories() {
    return Object.values(ServiceCategory).map((category) => ({
      key: category,
      label: this.buildCategoryLabel(category),
    }));
  }

  async listServices(filters?: ServiceFilters) {
    const query = this.serviceRepository
      .createQueryBuilder('service')
      .leftJoinAndSelect('service.providerUser', 'providerUser')
      .where('service.isActive = true')
      .orderBy('service.rating', 'DESC')
      .addOrderBy('service.completedJobs', 'DESC');

    if (filters?.category) {
      query.andWhere('service.category = :category', {
        category: filters.category,
      });
    }

    if (filters?.region) {
      query.andWhere('service.region = :region', {
        region: filters.region,
      });
    }

    if (filters?.district) {
      query.andWhere('service.district = :district', {
        district: filters.district,
      });
    }

    if (filters?.urgent === 'true') {
      query.andWhere('service.urgentAvailable = true');
    }

    const services = await query.getMany();
    const providerStatsMap = await this.getProviderStatsMap(
      Array.from(new Set(services.map((service) => service.providerUserId))),
    );

    return services.map((service) =>
      this.mapService(service, providerStatsMap.get(service.providerUserId)),
    );
  }

  async getServiceById(id: string) {
    const service = await this.serviceRepository.findOne({
      where: { id },
      relations: ['providerUser'],
    });

    if (!service) {
      return null;
    }

    const providerStatsMap = await this.getProviderStatsMap([service.providerUserId]);
    return this.mapService(service, providerStatsMap.get(service.providerUserId), true);
  }

  async listMine(userId: string) {
    const services = await this.serviceRepository.find({
      where: { providerUserId: userId },
      relations: ['providerUser'],
      order: { updatedAt: 'DESC' },
    });

    const providerStatsMap = await this.getProviderStatsMap([userId]);
    return services.map((service) =>
      this.mapService(service, providerStatsMap.get(userId), true),
    );
  }

  async getMyProviderProfile(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const services = await this.serviceRepository.find({
      where: { providerUserId: userId },
      order: { updatedAt: 'DESC' },
    });
    const providerStatsMap = await this.getProviderStatsMap([userId]);
    const stats =
      providerStatsMap.get(userId) ?? {
        activeServices: 0,
        totalReviews: 0,
        totalCompletedJobs: 0,
        averageRating: 0,
      };

    return {
      provider: {
        id: user.id,
        fullName: user.fullName,
        phone: user.phone,
        email: user.email ?? null,
        region: user.region,
        district: user.district,
      },
      stats,
      services: services.map((service) => ({
        id: service.id,
        title: service.title,
        category: service.category,
        isActive: service.isActive,
        availability: service.availability,
        responseSlaHours: service.responseSlaHours,
        updatedAt: service.updatedAt,
      })),
    };
  }

  async createService(userId: string, dto: CreateServiceDto) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const service = await this.serviceRepository.save(
      this.serviceRepository.create({
        ...dto,
        providerUserId: userId,
        currency: dto.currency ?? 'KZT',
        urgentAvailable: dto.urgentAvailable ?? false,
        availability: dto.availability ?? 'on_request',
        serviceArea: dto.serviceArea ?? null,
        responseSlaHours: dto.responseSlaHours ?? 24,
        isActive: dto.isActive ?? true,
        rating: dto.rating ?? 4.5,
        reviewsCount: dto.reviewsCount ?? 0,
        completedJobs: dto.completedJobs ?? 0,
        imageUrl: dto.imageUrl ?? null,
      }),
    );

    return this.getServiceById(service.id);
  }

  async updateService(id: string, userId: string, dto: UpdateServiceDto) {
    const existing = await this.getOwnedServiceOrFail(id, userId);

    await this.serviceRepository.save(
      this.serviceRepository.create({
        ...existing,
        ...dto,
        serviceArea:
          dto.serviceArea !== undefined ? dto.serviceArea : existing.serviceArea,
        imageUrl: dto.imageUrl !== undefined ? dto.imageUrl : existing.imageUrl,
      }),
    );

    return this.getServiceById(id);
  }

  async removeService(id: string, userId: string) {
    await this.getOwnedServiceOrFail(id, userId);
    await this.serviceRepository.delete({ id });

    return {
      id,
      deleted: true,
    };
  }
}
