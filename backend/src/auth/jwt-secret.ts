import { ConfigService } from '@nestjs/config';

/** The JWT secret must be provided explicitly; there is deliberately no default. */
export const requireJwtSecret = (config: Pick<ConfigService, 'get'>): string => {
  const secret = config.get<string>('JWT_SECRET')?.trim();
  if (!secret) {
    throw new Error('JWT_SECRET is not set. Refusing to start without a signing secret.');
  }
  return secret;
};
