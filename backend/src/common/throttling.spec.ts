import { Controller, Get, INestApplication, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { SkipThrottle, Throttle, ThrottlerModule } from '@nestjs/throttler';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppThrottlerGuard } from './app-throttler.guard';

@Controller('t')
class ProbeController {
  @Get('open') open() { return { ok: true }; }
  @Throttle({ default: { limit: 2, ttl: 60_000 } }) @Post('login') login() { return { ok: true }; }
  @SkipThrottle() @Get('health') health() { return { ok: true }; }
}

describe('rate limiting (SEC-09)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: 5 }] })],
      controllers: [ProbeController],
      providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(() => app.close());

  const hit = (method: 'get' | 'post', path: string, ip?: string) => {
    const r = request(app.getHttpServer())[method](path);
    return ip ? r.set('CF-Connecting-IP', ip) : r;
  };

  it('returns 429 after the default budget is used up', async () => {
    for (let i = 0; i < 5; i++) await hit('get', '/t/open', '1.1.1.1').expect(200);
    const res = await hit('get', '/t/open', '1.1.1.1');
    expect(res.status).toBe(429);
  });

  it('applies a stricter budget to credential endpoints', async () => {
    await hit('post', '/t/login', '2.2.2.2').expect(201);
    await hit('post', '/t/login', '2.2.2.2').expect(201);
    await hit('post', '/t/login', '2.2.2.2').expect(429);
  });

  it('counts each client (CF-Connecting-IP) separately', async () => {
    for (let i = 0; i < 2; i++) await hit('post', '/t/login', '3.3.3.3').expect(201);
    await hit('post', '/t/login', '3.3.3.3').expect(429);
    await hit('post', '/t/login', '4.4.4.4').expect(201);
  });

  it('never throttles health checks', async () => {
    for (let i = 0; i < 20; i++) await hit('get', '/t/health', '5.5.5.5').expect(200);
  });

  it('exposes rate-limit headers', async () => {
    const res = await hit('get', '/t/open', '6.6.6.6');
    expect(Object.keys(res.headers).some((h) => h.startsWith('x-ratelimit'))).toBe(true);
  });
});
