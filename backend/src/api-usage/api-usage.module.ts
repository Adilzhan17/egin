import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiUsageController } from './api-usage.controller';
import { ApiUsageService } from './api-usage.service';
import { ApiUsage } from './entities/api-usage.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ApiUsage])],
  controllers: [ApiUsageController],
  providers: [ApiUsageService],
  exports: [ApiUsageService],
})
export class ApiUsageModule {}
