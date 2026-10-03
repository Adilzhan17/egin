import 'reflect-metadata';
import { readFileSync } from 'fs';
import { join } from 'path';
import { JwtStrategy } from './auth/strategies/jwt.strategy';

/**
 * Cheap guards for configuration-level findings from docs/CODE_REVIEW.md.
 * `it.failing` = the issue still exists; it flips red when fixed so the marker can be removed.
 */
const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

describe('security posture (static)', () => {
  it('SEC-01: main.ts does not seed an admin with a hard-coded password', () => {
    expect(read('src/main.ts')).not.toMatch(/password123/);
  });

  it('SEC-08: JwtStrategy refuses to start without JWT_SECRET (no default secret)', () => {
    const noSecret = { get: (_key: string, fallback?: string) => fallback };
    expect(() => new JwtStrategy(noSecret as any)).toThrow(/JWT_SECRET/);
    expect(() => new JwtStrategy({ get: () => '   ' } as any)).toThrow(/JWT_SECRET/);
    expect(() => new JwtStrategy({ get: () => 'a-real-secret' } as any)).not.toThrow();
  });

  it('SEC-08: no hard-coded fallback secret remains in the source', () => {
    expect(read('src/auth/auth.module.ts') + read('src/auth/strategies/jwt.strategy.ts')).not.toMatch(/super-secret-key-for-dev/);
  });

  it('SEC-09: the API has rate limiting (@nestjs/throttler) for auth endpoints', () => {
    const deps = JSON.parse(read('package.json')).dependencies;
    expect(deps['@nestjs/throttler']).toBeDefined();
  });

  it('BUG-01: ConfigModule does not fall back to .env.example', () => {
    expect(read('src/app.module.ts')).not.toMatch(/envFilePath:\s*\[[^\]]*\.env\.example/);
  });

  it('SEC-09: auth endpoints carry a stricter throttle', () => {
    const src = read('src/auth/auth.controller.ts');
    expect((src.match(/@Throttle\(AUTH_THROTTLE\)/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it('SEC-10: /metrics is served by a guarded controller, not the open default', () => {
    expect(read('src/app.module.ts')).toMatch(/PrometheusModule\.register\(\{ controller: MetricsController \}\)/);
    expect(read('src/common/metrics.controller.ts')).toMatch(/UseGuards\(MetricsGuard\)/);
  });

  it('CORS allow-list is configurable through ALLOWED_ORIGINS', () => {
    expect(read('src/main.ts')).toMatch(/process\.env\.ALLOWED_ORIGINS/);
  });

  it('cookies are httpOnly, SameSite=lax and secure in production', () => {
    const src = read('src/auth/auth.controller.ts');
    expect(src).toMatch(/httpOnly: true/);
    expect(src).toMatch(/sameSite: 'lax'/);
    expect(src).toMatch(/secure: process\.env\.NODE_ENV === 'production'/);
  });
});
