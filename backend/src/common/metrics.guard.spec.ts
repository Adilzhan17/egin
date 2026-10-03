import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { MetricsGuard } from './metrics.guard';

describe('MetricsGuard (SEC-10)', () => {
  const ctx = (authorization?: string) => ({ switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }) }) as any;
  const original = process.env.METRICS_TOKEN;
  afterEach(() => {
    if (original === undefined) delete process.env.METRICS_TOKEN;
    else process.env.METRICS_TOKEN = original;
  });

  it('hides the endpoint (404) when METRICS_TOKEN is not configured', () => {
    delete process.env.METRICS_TOKEN;
    expect(() => new MetricsGuard().canActivate(ctx('Bearer x'))).toThrow(NotFoundException);
  });

  it('requires the exact bearer token', () => {
    process.env.METRICS_TOKEN = 's3cret';
    const guard = new MetricsGuard();
    expect(guard.canActivate(ctx('Bearer s3cret'))).toBe(true);
    for (const bad of [undefined, '', 'Bearer wrong', 'Bearer s3cre', 's3cret', 'Bearer s3cret ']) {
      expect(() => guard.canActivate(ctx(bad))).toThrow(UnauthorizedException);
    }
  });
});
