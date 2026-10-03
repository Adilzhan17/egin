import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendOtpDto {
  @ApiProperty({ example: '+77012345678' })
  @IsString()
  @IsNotEmpty()
  phone: string;
}

export class VerifyOtpDto extends SendOtpDto {
  @ApiProperty({ example: '1234' })
  @IsString()
  @Matches(/^\d{4}$/, { message: 'code must be 4 digits' })
  code: string;
}

export class ResetPasswordDto extends VerifyOtpDto {
  @ApiProperty({ example: 'newStrongPassword' })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  @MaxLength(72) // bcrypt ignores everything beyond 72 bytes
  newPassword: string;
}
