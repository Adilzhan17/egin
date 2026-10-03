import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InfoCenterController } from './info-center.controller';
import { InfoCenterItem } from './entities/info-center-item.entity';
import { InfoCenterService } from './info-center.service';

@Module({
  imports: [TypeOrmModule.forFeature([InfoCenterItem])],
  controllers: [InfoCenterController],
  providers: [InfoCenterService],
  exports: [InfoCenterService],
})
export class InfoCenterModule {}
