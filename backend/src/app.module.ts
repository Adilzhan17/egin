import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { FarmPlotsModule } from './farm-plots/farm-plots.module';
import { FarmActivitiesModule } from './farm-activities/farm-activities.module';
import { CropsModule } from './crops/crops.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AiAdviceModule } from './ai/ai-advice.module';
import { OrdersModule } from './orders/orders.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { WeatherModule } from './weather/weather.module';

import { ChatModule } from './chat/chat.module';
import { InfoCenterModule } from './info-center/info-center.module';
import { ServicesModule } from './services/services.module';
import { buildDatabaseOptions } from './database/database.config';
import { DemoDataModule } from './demo/demo-data.module';
import { ApiUsageModule } from './api-usage/api-usage.module';
import { RedisCacheModule } from './cache/cache.module';
import { HealthModule } from './health/health.module';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { LoggerModule } from 'nestjs-pino';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppThrottlerGuard } from './common/app-throttler.guard';
import { DEFAULT_LIMIT, THROTTLE_TTL_MS } from './common/throttle.config';
import { MetricsController } from './common/metrics.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    RedisCacheModule,
    TypeOrmModule.forRoot(buildDatabaseOptions()),
    UsersModule,
    AuthModule,
    FarmPlotsModule,
    FarmActivitiesModule,
    CropsModule,
    MarketplaceModule,
    AnalyticsModule,
    AiAdviceModule,
    OrdersModule,
    DashboardModule,
    WeatherModule,
    ChatModule,
    InfoCenterModule,
    ServicesModule,
    DemoDataModule,
    ApiUsageModule,
    HealthModule,
    ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: THROTTLE_TTL_MS, limit: DEFAULT_LIMIT }] }),
    // The custom controller replaces the open default /metrics (guarded by MetricsGuard).
    PrometheusModule.register({ controller: MetricsController }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty' }
            : undefined,
      },
    }),
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class AppModule {}
