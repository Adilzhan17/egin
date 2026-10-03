import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCropDto {
  @ApiProperty({ example: 'Арбуз' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Бахчевые' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional({ example: '#C6A85E' })
  @IsString()
  @IsOptional()
  color?: string;

  @ApiPropertyOptional({ example: 'watermelon_icon' })
  @IsString()
  @IsOptional()
  icon?: string;
}
