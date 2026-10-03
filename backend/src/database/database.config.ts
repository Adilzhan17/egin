import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSourceOptions } from 'typeorm';
import { Chat, ChatMessage, ChatParticipant } from '../chat/entities/chat.entity';
import { Crop } from '../crops/entities/crop.entity';
import { FarmPlot } from '../farm-plots/entities/farm-plot.entity';
import { FarmActivity } from '../farm-activities/entities/farm-activity.entity';
import { InfoCenterItem } from '../info-center/entities/info-center-item.entity';
import { MarketplaceListing } from '../marketplace/entities/marketplace-listing.entity';
import { Order, OrderItem } from '../orders/entities/order.entity';
import { ServiceListing } from '../services/entities/service-listing.entity';
import { User } from '../users/entities/user.entity';
import { parseEnvBoolean, parseEnvNumber } from '../common/utils/env.util';
import { ApiUsage } from '../api-usage/entities/api-usage.entity';

export const DATABASE_ENTITIES = [
  User,
  FarmPlot,
  FarmActivity,
  Crop,
  MarketplaceListing,
  Order,
  OrderItem,
  Chat,
  ChatParticipant,
  ChatMessage,
  InfoCenterItem,
  ServiceListing,
  ApiUsage,
];

export const buildDatabaseOptions = (
  env: NodeJS.ProcessEnv = process.env,
): TypeOrmModuleOptions & DataSourceOptions => {
  const hasUrl = !!env.DATABASE_URL;

  // Supabase Supavisor pooler uses port 6543 — transaction mode, max 10 conns per project on free tier
  const isSupabasePooler =
    hasUrl && env.DATABASE_URL!.includes('.pooler.supabase.com');

  // SSL always enabled when connecting via URL (Supabase requires it)
  const isSslEnabled = parseEnvBoolean(env.DB_SSL, hasUrl);

  const baseConfig: any = {
    type: 'postgres',
    entities: DATABASE_ENTITIES,
    autoLoadEntities: true,
    migrations: [__dirname + '/migrations/*{.ts,.js}'],
    synchronize: parseEnvBoolean(env.DB_SYNCHRONIZE, false),
    migrationsRun: parseEnvBoolean(env.DB_MIGRATIONS_RUN, false),
    logging: parseEnvBoolean(env.DB_LOGGING, false),
    ssl: isSslEnabled ? { rejectUnauthorized: false } : false,
    extra: {
      // Supabase free tier: max 60 connections total, pooler transaction mode is stateless
      max: parseEnvNumber(env.DB_POOL_MAX, isSupabasePooler ? 10 : 20),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      // Docker containers are IPv4-only; Supabase resolves to IPv6 by default
      family: 4,
    },
  };

  if (hasUrl) {
    // Supabase adds ?pgbouncer=true in some dashboard URLs — strip it,
    // pg driver doesn't need it and TypeORM doesn't use it
    const url = env.DATABASE_URL!
      .replace(/[?&]pgbouncer=true/g, '')
      .replace(/\?$/, '');
    baseConfig.url = url;
  } else {
    baseConfig.host = env.DB_HOST || 'localhost';
    baseConfig.port = parseEnvNumber(env.DB_PORT, 5432);
    baseConfig.username = env.DB_USERNAME || 'postgres';
    baseConfig.password = env.DB_PASSWORD || 'postgres';
    baseConfig.database = env.DB_NAME || 'agro_platform_db';
  }

  return baseConfig;
};
