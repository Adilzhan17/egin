import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ListingStatus,
  ListingVisibilityStatus,
} from '../entities/marketplace-listing.entity';

const toBoolean = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === '1';

export class CreateListingDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  cropId: string;

  @ApiProperty({ example: 'Продам арбузы сладкие прям с поля' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Фрукты' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 10 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity: number;

  @ApiProperty({ example: 'tons' })
  @IsString()
  @IsNotEmpty()
  unit: string;

  @ApiProperty({ example: 35000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({ example: 'KZT', default: 'KZT' })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiProperty({ example: '2024-08-01' })
  @IsDateString()
  availableFrom: string;

  @ApiProperty({ example: 'Turkestan Region, Zhetisay' })
  @IsString()
  @IsNotEmpty()
  location: string;

  @ApiPropertyOptional({
    example:
      'https://images.unsplash.com/photo-1589984662646-e7b2e4962f18?q=80&w=1200&auto=format&fit=crop',
  })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ example: true, default: false })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  deliveryAvailable?: boolean;

  @ApiPropertyOptional({ example: 'Доставка по области в течение 24 часов' })
  @IsOptional()
  @IsString()
  deliveryNotes?: string;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  freshnessDays?: number;

  @ApiPropertyOptional({ example: 14 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  storageLifeDays?: number;

  @ApiPropertyOptional({ example: 'Хранить в тени и прохладе, без перепадов температуры.' })
  @IsOptional()
  @IsString()
  storageConditions?: string;

  @ApiPropertyOptional({ example: 'Алматинская область' })
  @IsOptional()
  @IsString()
  recommendedRegion?: string;

  @ApiPropertyOptional({ example: 'lead_chat', default: 'lead_chat' })
  @IsOptional()
  @IsString()
  saleModel?: string;
}

export class UpdateListingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  cropId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  availableFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  deliveryAvailable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryNotes?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  freshnessDays?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  storageLifeDays?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  storageConditions?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recommendedRegion?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  saleModel?: string;

  @ApiPropertyOptional({ enum: ListingStatus })
  @IsEnum(ListingStatus)
  @IsOptional()
  status?: ListingStatus;

  @ApiPropertyOptional({ enum: ListingVisibilityStatus })
  @IsEnum(ListingVisibilityStatus)
  @IsOptional()
  visibilityStatus?: ListingVisibilityStatus;
}
