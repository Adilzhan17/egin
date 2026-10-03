import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FarmPlot } from '../farm-plots/entities/farm-plot.entity';

const toFinite = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(FarmPlot)
    private readonly plotRepository: Repository<FarmPlot>,
  ) {}

  async getRegionStats(region: string) {
    if (!region) throw new BadRequestException('Region is required');

    return this.plotRepository
      .createQueryBuilder('plot')
      .select('plot.cropType', 'cropType')
      .addSelect('SUM(plot.areaSizeHectares)', 'totalHectares')
      .addSelect('COUNT(plot.id)', 'farmsCount')
      .where('plot.region = :region', { region })
      .groupBy('plot.cropType')
      .getRawMany();
  }

  private parseCenter(lat: unknown, lng: unknown, radiusKm: unknown) {
    const latitude = toFinite(lat);
    const longitude = toFinite(lng);
    const radius = radiusKm === undefined ? 50 : toFinite(radiusKm);
    if (latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      throw new BadRequestException('lat and lng are required and must be valid coordinates');
    }
    if (radius === null || radius <= 0 || radius > 1000) {
      throw new BadRequestException('radiusKm must be a number between 0 and 1000');
    }
    return { latitude, longitude, radius };
  }

  async getOverproductionRisk(lat: number, lng: number, cropType: string, radiusKm: number = 50) {
    if (!cropType) throw new BadRequestException('lat, lng, and cropType are required');
    const { latitude, longitude, radius } = this.parseCenter(lat, lng, radiusKm);

    const result = await this.plotRepository
      .createQueryBuilder('plot')
      .select('SUM(plot.areaSizeHectares)', 'totalHectares')
      .where('plot.cropType = :cropType', { cropType })
      .andWhere(
        'ST_DWithin(plot.geometry, ST_MakePoint(:lng, :lat)::geography, :distance)'
      )
      .setParameters({ lng: longitude, lat: latitude, distance: radius * 1000 })
      .getRawOne();
      
    const ha = parseFloat(result?.totalHectares || '0');
    
    // Abstract risk threshold calculation logic
    let riskLevel = 'LOW';
    if (ha > 500) {
      riskLevel = 'HIGH';
    } else if (ha > 200) {
      riskLevel = 'MEDIUM';
    }

    return {
      cropType,
      radiusKm: radius,
      totalHectaresPlanted: ha,
      riskLevel
    };
  }

  async getCropDensity(lat: number, lng: number, radiusKm: number = 50) {
    const { latitude, longitude, radius } = this.parseCenter(lat, lng, radiusKm);

    return this.plotRepository
      .createQueryBuilder('plot')
      .select('plot.cropType', 'cropType')
      .addSelect('SUM(plot.areaSizeHectares)', 'totalHectares')
      .where(
        'ST_DWithin(plot.geometry, ST_MakePoint(:lng, :lat)::geography, :distance)'
      )
      .setParameters({ lng: longitude, lat: latitude, distance: radius * 1000 })
      .groupBy('plot.cropType')
      .orderBy('"totalHectares"', 'DESC')
      .getRawMany();
  }
}
