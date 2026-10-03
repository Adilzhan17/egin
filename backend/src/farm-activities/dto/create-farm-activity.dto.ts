import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FarmActivityType } from '../entities/farm-activity.entity';

export class CreateFarmActivityDto {
  @ApiProperty({ enum: FarmActivityType, example: FarmActivityType.WATERING })
  @IsEnum(FarmActivityType)
  type: FarmActivityType;

  @ApiProperty({ example: '2026-04-19' })
  @IsDateString()
  activityDate: string;

  @ApiPropertyOptional({ example: 'Полив арбуза после жаркого дня.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: 'https://example.com/field-photo.jpg' })
  @IsOptional()
  @IsString()
  photoUrl?: string;

  @ApiPropertyOptional({ example: 5000, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costKzt?: number;

  @ApiPropertyOptional({ example: ['селитра', 'капельный полив'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  materials?: string[];
}
