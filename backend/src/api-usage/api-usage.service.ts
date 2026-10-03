import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiUsage } from './entities/api-usage.entity';

@Injectable()
export class ApiUsageService implements OnModuleInit {
  constructor(
    @InjectRepository(ApiUsage)
    private readonly usageRepo: Repository<ApiUsage>,
  ) {}

  async onModuleInit() {
    const existing = await this.usageRepo.findOne({ where: { provider: 'google_maps' } });
    if (!existing) {
      const g = this.usageRepo.create({ provider: 'google_maps', monthlyLimit: 28500 });
      await this.usageRepo.save(g);
    }
  }

  async increment(provider: string) {
    const usage = await this.usageRepo.findOne({ where: { provider } });
    if (usage) {
      usage.callCount += 1;
      await this.usageRepo.save(usage);
    }
  }

  async getStats() {
    return this.usageRepo.find();
  }
}
