import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateDirectChatDto {
  @ApiProperty()
  @IsUUID()
  participantUserId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  listingId?: string;
}

export class SendMessageDto {
  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  body: string;

  @ApiPropertyOptional({ default: 'text' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  attachmentUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
