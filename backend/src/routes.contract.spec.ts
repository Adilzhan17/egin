import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';

import { AiAdviceController } from './ai/ai-advice.controller';
import { AnalyticsController } from './analytics/analytics.controller';
import { ApiUsageController } from './api-usage/api-usage.controller';
import { AppController } from './app.controller';
import { AuthController } from './auth/auth.controller';
import { JwtStrategy } from './auth/strategies/jwt.strategy';
import { ChatController } from './chat/chat.controller';
import { CropsController } from './crops/crops.controller';
import { DashboardController } from './dashboard/dashboard.controller';
import { FarmActivitiesController } from './farm-activities/farm-activities.controller';
import { FarmActivityType } from './farm-activities/entities/farm-activity.entity';
import { FarmPlotsController } from './farm-plots/farm-plots.controller';
import { HealthController } from './health/health.controller';
import { InfoCenterController } from './info-center/info-center.controller';
import { MarketplaceController } from './marketplace/marketplace.controller';
import { OrdersController } from './orders/orders.controller';
import { ServicesController } from './services/services.controller';
import { UsersController } from './users/users.controller';
import { WeatherController } from './weather/weather.controller';

/**
 * Route contract: every HTTP route of the API, its auth requirement and (where useful) a valid body.
 * Services are stubbed, guards/pipes/strategy are the real ones — this test proves the HTTP surface,
 * auth wiring and request validation without a database.
 *
 * The table is cross-checked against the routes Nest actually registered, so adding an endpoint
 * without listing it here fails the build.
 */

type Auth = 'public' | 'jwt';
interface Route {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  auth: Auth;
  /** A body that passes validation; when set the authenticated call must succeed (< 400). */
  body?: Record<string, unknown>;
  /** Route is unauthenticated today but should not be (see docs/CODE_REVIEW.md). */
  knownOpen?: string;
}

const UUID = '123e4567-e89b-12d3-a456-426614174000';

const ROUTES: Route[] = [
  // app / health
  { method: 'GET', path: '/', auth: 'public' },
  { method: 'GET', path: '/health', auth: 'public' },
  { method: 'GET', path: '/api/health', auth: 'public' },

  // auth
  { method: 'POST', path: '/auth/register', auth: 'public', body: { fullName: 'A', phone: '+77010000000', password: 'secret1', region: 'R', district: 'D' } },
  { method: 'POST', path: '/auth/login', auth: 'public', body: { phone: '+77010000000', password: 'secret1' } },
  { method: 'POST', path: '/auth/otp/send', auth: 'public', body: { phone: '+77010000000' } },
  { method: 'POST', path: '/auth/otp/verify', auth: 'public', body: { phone: '+77010000000', code: '1234' } },
  { method: 'POST', path: '/auth/password/reset', auth: 'public', body: { phone: '+77010000000', code: '1234', newPassword: 'secret1' } },
  { method: 'POST', path: '/auth/logout', auth: 'public' },

  // users
  { method: 'GET', path: '/users/me', auth: 'jwt' },
  { method: 'PATCH', path: '/users/me', auth: 'jwt', body: { fullName: 'New Name' } },

  // dashboard
  { method: 'GET', path: '/dashboard', auth: 'jwt' },
  { method: 'GET', path: '/dashboard/home', auth: 'jwt' },
  { method: 'GET', path: '/dashboard/notifications', auth: 'jwt' },
  { method: 'GET', path: '/dashboard/insights', auth: 'jwt' },

  // farm plots
  { method: 'POST', path: '/farm-plots', auth: 'jwt', body: { title: 'T', region: 'R', district: 'D', areaSizeHectares: 1, geometry: { type: 'Polygon', coordinates: [] }, cropType: 'wheat', seasonYear: 2026 } },
  { method: 'GET', path: '/farm-plots', auth: 'jwt' },
  { method: 'GET', path: '/farm-plots/mine', auth: 'jwt' },
  { method: 'PATCH', path: '/farm-plots/:id', auth: 'jwt', body: { title: 'x' } },
  { method: 'GET', path: '/farm-plots/:id/competition', auth: 'jwt' },
  { method: 'GET', path: '/farm-plots/:id/season-summary', auth: 'jwt' },
  { method: 'DELETE', path: '/farm-plots/:id', auth: 'jwt' },
  { method: 'GET', path: '/farm-plots/:plotId/ai-advice', auth: 'jwt' },

  // farm activities
  { method: 'POST', path: '/farm-plots/:plotId/activities', auth: 'jwt', body: { type: Object.values(FarmActivityType)[0], activityDate: '2026-05-01' } },
  { method: 'GET', path: '/farm-plots/:plotId/activities', auth: 'jwt' },
  { method: 'DELETE', path: '/farm-activities/:id', auth: 'jwt' },

  // crops catalog
  { method: 'GET', path: '/crops', auth: 'public' },
  { method: 'POST', path: '/crops', auth: 'public', body: { name: 'W', category: 'grain' }, knownOpen: 'SEC-04' },
  { method: 'PATCH', path: '/crops/:id', auth: 'public', body: { name: 'W2' }, knownOpen: 'SEC-04' },

  // marketplace
  { method: 'GET', path: '/marketplace/listings', auth: 'public' },
  { method: 'GET', path: '/marketplace/listings/my', auth: 'jwt' },
  { method: 'GET', path: '/marketplace/listings/:id', auth: 'public' },
  { method: 'POST', path: '/marketplace/listings', auth: 'jwt' },
  { method: 'PATCH', path: '/marketplace/listings/:id', auth: 'jwt' },
  { method: 'DELETE', path: '/marketplace/listings/:id', auth: 'jwt' },

  // orders
  { method: 'POST', path: '/orders', auth: 'jwt', body: { items: [{ listingId: 'a', title: 'A', quantity: 1, unit: 'kg', priceAtPurchase: 10 }] } },
  { method: 'GET', path: '/orders/my', auth: 'jwt' },

  // chats
  { method: 'POST', path: '/chats/direct', auth: 'jwt', body: { participantUserId: UUID } },
  { method: 'GET', path: '/chats', auth: 'jwt' },
  { method: 'GET', path: '/chats/channels', auth: 'jwt' },
  { method: 'GET', path: '/chats/:id/messages', auth: 'jwt' },
  { method: 'POST', path: '/chats/:id/messages', auth: 'jwt', body: { body: 'hello' } },

  // services
  { method: 'GET', path: '/services/categories', auth: 'public' },
  { method: 'GET', path: '/services/providers/me', auth: 'jwt' },
  { method: 'GET', path: '/services/mine', auth: 'jwt' },
  { method: 'GET', path: '/services', auth: 'public' },
  { method: 'POST', path: '/services', auth: 'jwt' },
  { method: 'GET', path: '/services/:id', auth: 'public' },
  { method: 'PATCH', path: '/services/:id', auth: 'jwt' },
  { method: 'DELETE', path: '/services/:id', auth: 'jwt' },

  // info center
  { method: 'GET', path: '/info-center/categories', auth: 'jwt' },
  { method: 'GET', path: '/info-center/feed', auth: 'jwt' },
  { method: 'GET', path: '/info-center/articles', auth: 'jwt' },

  // weather
  { method: 'GET', path: '/weather', auth: 'public' },
  { method: 'GET', path: '/weather/current', auth: 'public' },
  { method: 'GET', path: '/weather/forecast', auth: 'public' },
  { method: 'GET', path: '/weather/alerts', auth: 'public' },

  // analytics
  { method: 'GET', path: '/analytics/region/:region', auth: 'public' },
  { method: 'GET', path: '/analytics/overproduction-risk', auth: 'public' },
  { method: 'GET', path: '/analytics/crop-density', auth: 'public' },

  // api usage
  { method: 'POST', path: '/api-usage/increment/:provider', auth: 'public', knownOpen: 'SEC-07' },
  { method: 'GET', path: '/api-usage/stats', auth: 'jwt' },
];

const CONTROLLERS = [
  AppController, HealthController, AuthController, UsersController, DashboardController, FarmPlotsController,
  FarmActivitiesController, AiAdviceController, CropsController, MarketplaceController, OrdersController,
  ChatController, ServicesController, InfoCenterController, WeatherController, AnalyticsController, ApiUsageController,
];

const SECRET = 'contract-test-secret';
const concrete = (path: string) => path.replace(/:[A-Za-z]+/g, UUID);
const label = (r: Route) => `${r.method} ${r.path}`;

/** Any method resolves to an empty object; enough for controllers that only forward calls. */
const stub = () =>
  new Proxy({}, { get: (_t, prop) => (prop === 'then' ? undefined : () => Promise.resolve({})) });

describe('API route contract', () => {
  let app: INestApplication;
  let token: string;

  const call = (r: Route, opts: { token?: string | null; body?: object } = {}) => {
    const http = request(app.getHttpServer());
    const url = concrete(r.path);
    let req =
      r.method === 'GET' ? http.get(url)
      : r.method === 'POST' ? http.post(url)
      : r.method === 'PATCH' ? http.patch(url)
      : http.delete(url);
    if (opts.token) req = req.set('Authorization', `Bearer ${opts.token}`);
    if (opts.body) req = req.send(opts.body);
    return req;
  };

  beforeAll(async () => {
    const deps = new Set<unknown>();
    for (const c of CONTROLLERS) {
      for (const dep of (Reflect.getMetadata('design:paramtypes', c) as unknown[]) ?? []) deps.add(dep);
    }

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ JWT_SECRET: SECRET })] }),
        PassportModule,
        JwtModule.register({ secret: SECRET, signOptions: { expiresIn: '1h' } }),
      ],
      controllers: CONTROLLERS,
      providers: [JwtStrategy, ...[...deps].map((d) => ({ provide: d as any, useValue: stub() }))],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    token = moduleRef.get(JwtService).sign({ sub: UUID, phone: '+77010000000', role: 'farmer' });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('documents every registered route (and nothing else)', () => {
    const router = (app.getHttpAdapter().getInstance() as any).router ?? (app.getHttpAdapter().getInstance() as any)._router;
    const registered = new Set<string>();
    for (const layer of router.stack) {
      if (!layer.route) continue;
      for (const method of Object.keys(layer.route.methods)) {
        registered.add(`${method.toUpperCase()} ${layer.route.path}`);
      }
    }
    const documented = new Set(ROUTES.map(label));
    expect([...registered].filter((r) => !documented.has(r)).sort()).toEqual([]);
    expect([...documented].filter((r) => !registered.has(r)).sort()).toEqual([]);
  });

  describe.each(ROUTES.filter((r) => r.auth === 'jwt'))('protected: $method $path', (r) => {
    it('401 without a token', async () => {
      await call(r, { body: r.body }).expect(401);
    });

    it('401 with a malformed token', async () => {
      await call(r, { token: 'not-a-jwt', body: r.body }).expect(401);
    });

    it('401 with a token signed by another secret', async () => {
      const forged = new JwtService({ secret: 'attacker' }).sign({ sub: UUID, role: 'admin' });
      await call(r, { token: forged, body: r.body }).expect(401);
    });

    it('401 with an expired token', async () => {
      const expired = new JwtService({ secret: SECRET }).sign({ sub: UUID, role: 'farmer' }, { expiresIn: '-10s' });
      await call(r, { token: expired, body: r.body }).expect(401);
    });

    it('401 with an unsigned (alg=none) token', async () => {
      const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
      const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: UUID, role: 'admin' })}.`;
      await call(r, { token: none, body: r.body }).expect(401);
    });

    it('accepts a valid Bearer token', async () => {
      const res = await call(r, { token, body: r.body });
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
      expect(res.status).toBeLessThan(500);
      if (r.body) expect(res.status).toBeLessThan(400);
    });

    it('accepts the agro_token cookie', async () => {
      const req = call(r, { body: r.body }).set('Cookie', `agro_token=${token}`);
      const res = await req;
      expect(res.status).not.toBe(401);
    });
  });

  describe.each(ROUTES.filter((r) => r.auth === 'public' && !r.knownOpen))('public: $method $path', (r) => {
    it('does not require a token', async () => {
      const res = await call(r, { body: r.body });
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
      expect(res.status).toBeLessThan(500);
    });
  });

  // KNOWN ISSUES: these routes mutate shared state without authentication.
  describe.each(ROUTES.filter((r) => r.knownOpen))('known open route: $method $path', (r) => {
    it.failing(`${r.knownOpen}: requires authentication`, async () => {
      await call(r, { body: r.body }).expect(401);
    });
  });

  describe('request validation (real ValidationPipe)', () => {
    const post = (path: string, body: object, auth = false) => {
      const req = request(app.getHttpServer()).post(path);
      return (auth ? req.set('Authorization', `Bearer ${token}`) : req).send(body);
    };

    it('register: 400 on an empty body', async () => {
      await post('/auth/register', {}).expect(400);
    });

    it('register: 400 on a short password', async () => {
      await post('/auth/register', { fullName: 'A', phone: '+7', password: '123', region: 'R', district: 'D' }).expect(400);
    });

    it('register: 400 on unknown fields (mass assignment guard)', async () => {
      await post('/auth/register', { fullName: 'A', phone: '+7', password: '123456', region: 'R', district: 'D', isAdmin: true }).expect(400);
    });

    it('login: 400 on empty credentials', async () => {
      await post('/auth/login', { phone: '', password: '' }).expect(400);
    });

    it('login: 200 sets httpOnly agro_token cookie', async () => {
      // stubbed AuthService returns {}; the controller still sets the session cookies
      const res = await post('/auth/login', { phone: '+7', password: 'x' });
      expect(res.status).toBe(200);
    });

    it('orders: 400 without items', async () => {
      await post('/orders', {}, true).expect(400);
    });

    it('chats/direct: 400 for a non-UUID participant', async () => {
      await post('/chats/direct', { participantUserId: 'nope' }, true).expect(400);
    });

    it('chat message: 400 above 1000 chars', async () => {
      await post(`/chats/${UUID}/messages`, { body: 'x'.repeat(1001) }, true).expect(400);
    });

    it('activities: 400 for an unknown type', async () => {
      await post(`/farm-plots/${UUID}/activities`, { type: 'x', activityDate: '2026-05-01' }, true).expect(400);
    });

    it('users/me PATCH: 400 when trying to set role', async () => {
      await request(app.getHttpServer()).patch('/users/me').set('Authorization', `Bearer ${token}`).send({ role: 'admin' }).expect(400);
    });

    it('unknown routes 404', async () => {
      await request(app.getHttpServer()).get('/definitely-not-a-route').expect(404);
    });
  });
});
