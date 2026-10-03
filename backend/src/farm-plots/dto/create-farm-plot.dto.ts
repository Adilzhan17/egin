import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsEnum,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlantingStatus } from '../entities/farm-plot.entity';

export class CreateFarmPlotDto {
  @ApiProperty({ example: 'My main melon field' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Turkestan Region' })
  @IsString()
  @IsNotEmpty()
  region: string;

  @ApiProperty({ example: 'Zhetisay' })
  @IsString()
  @IsNotEmpty()
  district: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  village?: string;

  @ApiProperty({ example: 45.5, description: 'Size in hectares' })
  @IsNumber()
  areaSizeHectares: number;

  @ApiProperty()
  @IsNotEmpty()
  geometry: any; // GeoJSON string or object for Polygon boundary

  @ApiProperty({ example: 'Watermelon' })
  @IsString()
  @IsNotEmpty()
  cropType: string;

  @ApiPropertyOptional({ example: '#ff0000' })
  @IsOptional()
  @IsString()
  fillColor?: string;

  @ApiProperty({ example: 2024 })
  @IsNumber()
  seasonYear: number;

  @ApiPropertyOptional({ example: '2026-04-06' })
  @IsOptional()
  @IsDateString()
  plantingDate?: string;

  @ApiPropertyOptional({ enum: PlantingStatus, default: PlantingStatus.PLANNED })
  @IsEnum(PlantingStatus)
  @IsOptional()
  plantingStatus?: PlantingStatus;
}
