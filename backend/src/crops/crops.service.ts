import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Crop } from './entities/crop.entity';
import { CreateCropDto } from './dto/create-crop.dto';
import { UpdateCropDto } from './dto/update-crop.dto';

@Injectable()
export class CropsService {
  constructor(
    @InjectRepository(Crop)
    private readonly cropRepository: Repository<Crop>,
  ) {}

  async create(createCropDto: CreateCropDto): Promise<Crop> {
    const crop = this.cropRepository.create(createCropDto);
    return this.cropRepository.save(crop);
  }

  findAll(): Promise<Crop[]> {
    return this.cropRepository.find();
  }

  findOne(id: string): Promise<Crop | null> {
    return this.cropRepository.findOne({ where: { id } });
  }

  async update(id: string, updateCropDto: UpdateCropDto): Promise<void> {
    await this.cropRepository.update(id, updateCropDto);
  }
}
