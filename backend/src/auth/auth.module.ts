import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { requireJwtSecret } from './jwt-secret';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: requireJwtSecret(configService),
        signOptions: { expiresIn: '7d' }, // token expires in 7 days
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy, AdminBootstrapService],
  controllers: [AuthController],
})
export class AuthModule {}
