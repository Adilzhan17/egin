import { buildDatabaseOptions } from './database.config';

const opts = (env: Record<string, string>) =>
  buildDatabaseOptions(env as NodeJS.ProcessEnv) as any;

describe('buildDatabaseOptions', () => {
  it('uses discrete DB_* settings when DATABASE_URL is absent', () => {
    const o = opts({
      DB_HOST: 'db',
      DB_PORT: '5433',
      DB_USERNAME: 'u',
      DB_PASSWORD: 'p',
      DB_NAME: 'n',
    });
    expect(o).toMatchObject({
      type: 'postgres',
      host: 'db',
      port: 5433,
      username: 'u',
      password: 'p',
      database: 'n',
      ssl: false,
    });
    expect(o.url).toBeUndefined();
  });

  it('uses safe defaults', () => {
    const o = opts({});
    expect(o.host).toBe('localhost');
    expect(o.port).toBe(5432);
    expect(o.synchronize).toBe(false);
    expect(o.migrationsRun).toBe(false);
  });

  it('enables SSL by default when DATABASE_URL is used and allows disabling it', () => {
    expect(opts({ DATABASE_URL: 'postgres://a/b' }).ssl).toEqual({ rejectUnauthorized: false });
    expect(opts({ DATABASE_URL: 'postgres://a/b', DB_SSL: 'false' }).ssl).toBe(false);
  });

  it('strips pgbouncer=true from the URL', () => {
    expect(opts({ DATABASE_URL: 'postgres://a/b?pgbouncer=true' }).url).toBe('postgres://a/b');
    expect(opts({ DATABASE_URL: 'postgres://a/b?x=1&pgbouncer=true' }).url).toBe('postgres://a/b?x=1');
  });

  it('shrinks the pool for the Supabase pooler', () => {
    expect(opts({ DATABASE_URL: 'postgres://x@aws.pooler.supabase.com:6543/postgres' }).extra.max).toBe(10);
    expect(opts({ DATABASE_URL: 'postgres://x@db/postgres' }).extra.max).toBe(20);
    expect(opts({ DATABASE_URL: 'postgres://x@db/postgres', DB_POOL_MAX: '5' }).extra.max).toBe(5);
  });

  it('honours migration/synchronize/logging flags', () => {
    const o = opts({ DB_MIGRATIONS_RUN: 'true', DB_SYNCHRONIZE: '1', DB_LOGGING: 'yes' });
    expect(o).toMatchObject({ migrationsRun: true, synchronize: true, logging: true });
  });

  it('registers every entity', () => {
    expect(opts({}).entities.length).toBeGreaterThanOrEqual(13);
  });

  it('forces IPv4 (docker is IPv4-only)', () => {
    expect(opts({}).extra.family).toBe(4);
  });
});
