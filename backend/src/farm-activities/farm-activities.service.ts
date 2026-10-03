import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FarmPlot } from '../farm-plots/entities/farm-plot.entity';
import { UserRole } from '../users/entities/user.entity';
import { CreateFarmActivityDto } from './dto/create-farm-activity.dto';
import { FarmActivity } from './entities/farm-activity.entity';

@Injectable()
export class FarmActivitiesService {
  constructor(
    @InjectRepository(FarmActivity)
    private readonly activityRepository: Repository<FarmActivity>,
    @InjectRepository(FarmPlot)
    private readonly plotRepository: Repository<FarmPlot>,
  ) {}

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

  private async getAccessiblePlotOrFail(
    plotId: string,
    userId: string,
    role: UserRole,
  ) {
    const plot = await this.plotRepository.findOne({ where: { id: plotId } });

    if (!plot) {
      throw new NotFoundException('Farm plot not found');
    }

    if (role !== UserRole.ADMIN && plot.userId !== userId) {
      throw new ForbiddenException('You do not have access to this farm plot');
    }

    return plot;
  }

  async create(
    plotId: string,
    userId: string,
    role: UserRole,
    dto: CreateFarmActivityDto,
  ) {
    await this.getAccessiblePlotOrFail(plotId, userId, role);

    const activity = await this.activityRepository.save(
      this.activityRepository.create({
        plotId,
        userId,
        type: dto.type,
        activityDate: new Date(dto.activityDate),
        description: this.normalizeOptionalText(dto.description) ?? null,
        photoUrl: this.normalizeOptionalText(dto.photoUrl) ?? null,
        costKzt: dto.costKzt ?? 0,
        materials: dto.materials?.map((item) => item.trim()).filter(Boolean) ?? null,
      }),
    );

    return this.findOne(activity.id, userId, role);
  }

  async findByPlot(plotId: string, userId: string, role: UserRole) {
    await this.getAccessiblePlotOrFail(plotId, userId, role);

    return this.activityRepository.find({
      where: { plotId },
      order: {
        activityDate: 'DESC',
        createdAt: 'DESC',
      },
    });
  }

  async findOne(id: string, userId: string, role: UserRole) {
    const activity = await this.activityRepository.findOne({ where: { id } });

    if (!activity) {
      throw new NotFoundException('Farm activity not found');
    }

    await this.getAccessiblePlotOrFail(activity.plotId, userId, role);
    return activity;
  }

  async remove(id: string, userId: string, role: UserRole) {
    const activity = await this.findOne(id, userId, role);
    await this.activityRepository.delete(id);

    return {
      id: activity.id,
      deleted: true,
    };
  }
}
