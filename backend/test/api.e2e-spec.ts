/**
 * Full API end-to-end suite against a REAL PostgreSQL/PostGIS database.
 *
 * Requires: DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME (and DB_MIGRATIONS_RUN=true) —
 * see docs/TESTING.md. Runs the real AppModule with the same middleware as main.ts.
 * External HTTP (Open-Meteo / OpenAI) is stubbed.
 */
import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import request from 'supertest';
import { AppModule } from '../src/app.module';

const uniq = Date.now().toString().slice(-8);
const phone = (n: number) => `+7701${uniq}${n}`;
const PASSWORD = 'Passw0rd!';
const ADMIN_PHONE = process.env.ADMIN_PHONE ?? '+77000000000';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'AdminPassw0rd!';
const METRICS_TOKEN = process.env.METRICS_TOKEN ?? 'e2e-metrics-token';

const POLYGON = {
  type: 'Polygon',
  coordinates: [[[76.9, 43.2], [76.91, 43.2], [76.91, 43.21], [76.9, 43.21], [76.9, 43.2]]],
};

describe('Egin API (e2e, real database)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

  const register = async (who: string, n: number, role?: string) => {
    const res = await http()
      .post('/auth/register')
      .send({ fullName: `User ${who}`, phone: phone(n), password: PASSWORD, region: 'Алматинская', district: 'Талгар', ...(role ? { role } : {}) });
    tokens[who] = res.body.access_token;
    ids[who] = res.body.user?.id;
    return res;
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.API_DOCS_ENABLED = 'false';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.use(cookieParser());
    app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const realFetch = global.fetch;
    jest.spyOn(global, 'fetch').mockImplementation(async (input: any, init?: any) => {
      const url = String(input);
      if (url.includes('open-meteo') || url.includes('/v1/forecast')) {
        return new Response(
          JSON.stringify({
            current: { temperature_2m: 21.5, wind_speed_10m: 3.2, weather_code: 1 },
            daily: {
              time: ['2026-09-21', '2026-09-22'],
              weather_code: [1, 63],
              temperature_2m_max: [25, 22],
              temperature_2m_min: [12, 10],
              precipitation_probability_max: [10, 80],
              precipitation_sum: [0, 6],
              wind_speed_10m_max: [5, 9],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return realFetch(input, init);
    });
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await app?.close();
  });

  describe('platform', () => {
    it('GET / returns API metadata', async () => {
      const res = await http().get('/').expect(200);
      expect(res.body).toMatchObject({ name: 'AgriPlan API', status: 'ok' });
    });

    it('GET /health is ok', async () => {
      const res = await http().get('/health').expect(200);
      expect(res.body.status).toBe('ok');
    });

    it('GET /api/health reports the database up', async () => {
      // Memory thresholds are env-configurable (QUAL-02); only the database matters for this assertion.
      const res = await http().get('/api/health');
      expect([200, 503]).toContain(res.status);
      const details = res.body.details ?? res.body.info;
      expect(details?.database?.status).toBe('up');
    });

    it('SEC-10: /metrics needs the bearer token', async () => {
      await http().get('/metrics').expect(401);
      await http().get('/metrics').set('Authorization', 'Bearer wrong').expect(401);
      const ok = await http().get('/metrics').set('Authorization', `Bearer ${METRICS_TOKEN}`).expect(200);
      expect(ok.text).toContain('process_cpu_user_seconds_total');
    });

    it('sets security headers (helmet)', async () => {
      const res = await http().get('/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('unknown route is 404', async () => {
      await http().get('/nope').expect(404);
    });
  });

  describe('auth & users', () => {
    it('registers a farmer, a second farmer and a buyer', async () => {
      const a = await register('a', 1);
      expect(a.status).toBe(201);
      expect(a.body.user).toMatchObject({ phone: phone(1), role: 'farmer' });
      expect(a.body.user.passwordHash).toBeUndefined();
      expect((await register('b', 2)).status).toBe(201);
      const c = await register('c', 3, 'buyer');
      expect(c.status).toBe(201);
      expect(c.body.user.role).toBe('buyer');
    });

    it('registration sets an httpOnly agro_token cookie and a readable is_logged_in flag', async () => {
      const res = await http().post('/auth/register').send({ fullName: 'Cookie', phone: phone(9), password: PASSWORD, region: 'R', district: 'D' });
      const cookies = ([] as string[]).concat(res.headers['set-cookie'] as any);
      const session = cookies.find((c) => c.startsWith('agro_token='));
      expect(session).toMatch(/HttpOnly/i);
      expect(session).toMatch(/SameSite=Lax/i);
      expect(cookies.find((c) => c.startsWith('is_logged_in='))).not.toMatch(/HttpOnly/i);
    });

    it('rejects a duplicate phone with 409', async () => {
      await register('dup', 1).then((r) => expect(r.status).toBe(409));
    });

    it('refuses to create admins through public registration', async () => {
      const res = await http().post('/auth/register').send({ fullName: 'Evil', phone: phone(8), password: PASSWORD, region: 'R', district: 'D', role: 'admin' });
      expect(res.status).toBe(403);
    });

    it('validates the registration body', async () => {
      await http().post('/auth/register').send({}).expect(400);
    });

    it('logs in and returns a working token', async () => {
      const res = await http().post('/auth/login').send({ phone: phone(1), password: PASSWORD }).expect(200);
      expect(res.body.access_token).toEqual(expect.any(String));
      await http().get('/users/me').set(auth('a')).expect(200);
    });

    it('rejects a wrong password and an unknown phone identically', async () => {
      const wrong = await http().post('/auth/login').send({ phone: phone(1), password: 'bad' });
      const unknown = await http().post('/auth/login').send({ phone: '+70000000000', password: 'bad' });
      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(wrong.body.message).toBe(unknown.body.message);
    });

    it('GET /users/me returns the profile without the password hash', async () => {
      const res = await http().get('/users/me').set(auth('a')).expect(200);
      expect(res.body.data).toMatchObject({ id: ids.a, phone: phone(1) });
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
    });

    it('PATCH /users/me updates the profile', async () => {
      const res = await http().patch('/users/me').set(auth('a')).send({ fullName: 'Renamed' }).expect(200);
      expect(res.body.data.fullName).toBe('Renamed');
    });

    it('PATCH /users/me refuses to take another user\'s phone (409) and to change the role (400)', async () => {
      await http().patch('/users/me').set(auth('a')).send({ phone: phone(2) }).expect(409);
      await http().patch('/users/me').set(auth('a')).send({ role: 'admin' }).expect(400);
    });

    it('the httpOnly cookie alone authenticates', async () => {
      await http().get('/users/me').set('Cookie', `agro_token=${tokens.a}`).expect(200);
    });

    it('logout clears the session cookies', async () => {
      const res = await http().post('/auth/logout').expect(200);
      const cookies = ([] as string[]).concat(res.headers['set-cookie'] as any).join(';');
      expect(cookies).toMatch(/agro_token=;/);
    });

    describe('password reset via OTP', () => {
      const captured = () => {
        const calls = (console.log as jest.Mock).mock.calls.map((c) => String(c[0]));
        const line = [...calls].reverse().find((l) => l.startsWith(`[OTP] Sent to ${phone(3)}`));
        return line?.split(': ').pop() as string;
      };

      it('OTP send → verify → reset → login with the new password', async () => {
        await http().post('/auth/otp/send').send({ phone: phone(3) }).expect(201);
        const code = captured();
        expect(code).toMatch(/^\d{4}$/);
        await http().post('/auth/otp/verify').send({ phone: phone(3), code: '0000' }).expect(401);
        await http().post('/auth/otp/verify').send({ phone: phone(3), code }).expect(200);
        await http().post('/auth/password/reset').send({ phone: phone(3), code, newPassword: 'NewPassw0rd!' }).expect(200);
        await http().post('/auth/login').send({ phone: phone(3), password: PASSWORD }).expect(401);
        await http().post('/auth/login').send({ phone: phone(3), password: 'NewPassw0rd!' }).expect(200);
        await http().post('/auth/password/reset').send({ phone: phone(3), code, newPassword: 'Another1!' }).expect(401); // single use
      });

      it('SEC-02/03: locks the code after 5 wrong guesses, rate-limits re-sends, validates the reset body', async () => {
        await http().post('/auth/otp/send').send({ phone: phone(4) }).expect(201);
        await http().post('/auth/otp/send').send({ phone: phone(4) }).expect(429); // 30 s cooldown
        const code = (console.log as jest.Mock).mock.calls.map((c) => String(c[0])).reverse().find((l) => l.startsWith(`[OTP] Sent to ${phone(4)}`))!.split(': ').pop()!;
        const wrong = code === '1111' ? '2222' : '1111';
        for (let i = 0; i < 5; i++) await http().post('/auth/otp/verify').send({ phone: phone(4), code: wrong }).expect(401);
        await http().post('/auth/otp/verify').send({ phone: phone(4), code }).expect(401); // burnt
        await http().post('/auth/password/reset').send({ phone: phone(4), code, newPassword: '1' }).expect(400);
        await http().post('/auth/otp/verify').send({ phone: phone(4), code: 'abcd' }).expect(400);
      });

      it('reset without a valid code is refused', async () => {
        await http().post('/auth/password/reset').send({ phone: phone(1), code: '1234', newPassword: 'Hacked123!' }).expect(401);
        await http().post('/auth/login').send({ phone: phone(1), password: PASSWORD }).expect(200);
      });
    });
  });

  describe('farm plots', () => {
    const plot = () => ({
      title: 'North field', region: 'Алматинская', district: 'Талгар', areaSizeHectares: 12.5,
      geometry: POLYGON, cropType: 'wheat', seasonYear: 2026,
    });

    it('creates a plot with a PostGIS geometry and returns the analysis', async () => {
      const res = await http().post('/farm-plots').set(auth('a')).send(plot());
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('lists own plots and finds the new one', async () => {
      const res = await http().get('/farm-plots/mine').set(auth('a')).expect(200);
      expect(res.body.success).toBe(true);
      const list = Array.isArray(res.body.data) ? res.body.data : res.body.data?.features ?? [];
      expect(list.length).toBeGreaterThan(0);
      const first = list[0];
      ids.plot = first.id ?? first.properties?.id;
      expect(ids.plot).toEqual(expect.any(String));
    });

    it("another farmer does not see it in 'mine'", async () => {
      const res = await http().get('/farm-plots/mine').set(auth('b')).expect(200);
      expect(JSON.stringify(res.body.data)).not.toContain(ids.plot);
    });

    it('rejects a non-polygon geometry with a 4xx', async () => {
      const res = await http().post('/farm-plots').set(auth('a')).send({ ...plot(), geometry: { type: 'Point', coordinates: [1, 1] } });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('validates the body (400)', async () => {
      await http().post('/farm-plots').set(auth('a')).send({ title: 'x' }).expect(400);
    });

    it('owner can PATCH; a stranger gets 403; anonymous gets 401', async () => {
      await http().patch(`/farm-plots/${ids.plot}`).set(auth('a')).send({ title: 'Renamed field' }).expect(200);
      await http().patch(`/farm-plots/${ids.plot}`).set(auth('b')).send({ title: 'pwn' }).expect(403);
      await http().patch(`/farm-plots/${ids.plot}`).send({ title: 'pwn' }).expect(401);
    });

    it('SEC-05: PATCH refuses to change ownership or identity (400) and leaves the owner intact', async () => {
      await http().patch(`/farm-plots/${ids.plot}`).set(auth('a')).send({ userId: ids.b }).expect(400);
      await http().patch(`/farm-plots/${ids.plot}`).set(auth('a')).send({ geometry: POLYGON }).expect(400);
      await http().patch(`/farm-plots/${ids.plot}`).set(auth('b')).send({ title: 'x' }).expect(403); // still not b's plot
      await http().patch(`/farm-plots/${ids.plot}`).set(auth('a')).send({ title: 'Renamed again', cropType: 'barley', fillColor: '#ff0000' }).expect(200);
    });

    it('returns competition and season summary to the owner only', async () => {
      const comp = await http().get(`/farm-plots/${ids.plot}/competition`).set(auth('a')).expect(200);
      expect(comp.body.success).toBe(true);
      await http().get(`/farm-plots/${ids.plot}/season-summary`).set(auth('a')).expect(200);
      await http().get(`/farm-plots/${ids.plot}/competition`).set(auth('b')).expect(403);
      await http().get(`/farm-plots/${ids.plot}/season-summary`).set(auth('b')).expect(403);
    });

    it('404 for a missing plot', async () => {
      await http().get('/farm-plots/00000000-0000-0000-0000-000000000000/season-summary').set(auth('a')).expect(404);
    });

    it('AI advice falls back gracefully without an OpenAI key', async () => {
      const res = await http().get(`/farm-plots/${ids.plot}/ai-advice`).set(auth('a'));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    describe('work journal', () => {
      it('adds, lists and deletes an entry (owner)', async () => {
        const created = await http()
          .post(`/farm-plots/${ids.plot}/activities`)
          .set(auth('a'))
          .send({ type: 'watering', activityDate: '2026-05-01', costKzt: 15000, description: 'Drip', materials: ['water'] });
        expect(created.status).toBe(201);
        const list = await http().get(`/farm-plots/${ids.plot}/activities`).set(auth('a')).expect(200);
        const entries = list.body.data;
        expect(entries).toHaveLength(1);
        ids.activity = entries[0].id;
        await http().delete(`/farm-activities/${ids.activity}`).set(auth('b')).expect(403);
        await http().delete(`/farm-activities/${ids.activity}`).set(auth('a')).expect(200);
      });

      it("a stranger can neither read nor write another farmer's journal", async () => {
        await http().get(`/farm-plots/${ids.plot}/activities`).set(auth('b')).expect(403);
        await http().post(`/farm-plots/${ids.plot}/activities`).set(auth('b')).send({ type: 'watering', activityDate: '2026-05-01' }).expect(403);
      });

      it('validates the entry', async () => {
        await http().post(`/farm-plots/${ids.plot}/activities`).set(auth('a')).send({ type: 'bogus', activityDate: 'x' }).expect(400);
      });
    });

    it('GET /farm-plots lists plots for the caller', async () => {
      await http().get('/farm-plots').set(auth('a')).expect(200);
    });

    it('DELETE: stranger 403, owner 200, then 404', async () => {
      await http().delete(`/farm-plots/${ids.plot}`).set(auth('b')).expect(403);
      await http().delete(`/farm-plots/${ids.plot}`).set(auth('a')).expect(200);
      await http().delete(`/farm-plots/${ids.plot}`).set(auth('a')).expect(404);
    });
  });

  describe('marketplace', () => {
    const listing = () => ({
      cropId: 'wheat', title: 'Wheat 3 class', category: 'Зерновые', description: 'Fresh', quantity: 100,
      unit: 'kg', price: 150, currency: 'KZT', availableFrom: '2026-09-21', location: 'Талгар',
    });

    it('a farmer creates a listing', async () => {
      const res = await http().post('/marketplace/listings').set(auth('a')).send(listing());
      expect(res.status).toBe(201);
      ids.listing = res.body.id ?? res.body.data?.id;
      expect(ids.listing).toEqual(expect.any(String));
    });

    it('validates the listing', async () => {
      await http().post('/marketplace/listings').set(auth('a')).send({ ...listing(), price: -5 }).expect(400);
      await http().post('/marketplace/listings').set(auth('a')).send({}).expect(400);
    });

    it('requires auth to create', async () => {
      await http().post('/marketplace/listings').send(listing()).expect(401);
    });

    it('is publicly readable (list and detail)', async () => {
      await http().get('/marketplace/listings').expect(200);
      const one = await http().get(`/marketplace/listings/${ids.listing}`).expect(200);
      expect(one.body.title ?? one.body.data?.title).toBe('Wheat 3 class');
    });

    it('supports search, category and sorting filters', async () => {
      await http().get('/marketplace/listings').query({ search: 'wheat', category: 'Все', sortBy: 'price', sortOrder: 'ASC' }).expect(200);
    });

    it('treats SQL metacharacters in search as data', async () => {
      await http().get('/marketplace/listings').query({ search: "'; DROP TABLE marketplace_listings;--" }).expect(200);
      await http().get(`/marketplace/listings/${ids.listing}`).expect(200);
    });

    it("'my' shows the owner's listings", async () => {
      const res = await http().get('/marketplace/listings/my').set(auth('a')).expect(200);
      expect(JSON.stringify(res.body)).toContain(ids.listing);
    });

    it('404 for an unknown listing', async () => {
      await http().get('/marketplace/listings/00000000-0000-0000-0000-000000000000').expect(404);
    });

    it("a stranger cannot edit or delete someone else's listing", async () => {
      await http().patch(`/marketplace/listings/${ids.listing}`).set(auth('b')).send({ title: 'pwn' }).expect(404);
      await http().delete(`/marketplace/listings/${ids.listing}`).set(auth('b')).expect(404);
    });

    it('the owner can edit and then delete', async () => {
      const upd = await http().patch(`/marketplace/listings/${ids.listing}`).set(auth('a')).send({ price: 175 });
      expect(upd.status).toBe(200);
      await http().delete(`/marketplace/listings/${ids.listing}`).set(auth('a')).expect(200);
      await http().get(`/marketplace/listings/${ids.listing}`).expect(404);
    });
  });

  describe('orders (server-side pricing)', () => {
    const listing = {
      cropId: 'wheat', title: 'Order wheat', category: 'Зерновые', description: 'x', quantity: 10,
      unit: 'kg', price: 100, currency: 'KZT', availableFrom: '2026-09-21', location: 'Талгар',
    };

    beforeAll(async () => {
      const res = await http().post('/marketplace/listings').set(auth('a')).send(listing);
      ids.orderListing = res.body.id ?? res.body.data?.id;
    });

    it('SEC-06: computes the total from the listing price and ignores client prices', async () => {
      const res = await http().post('/orders').set(auth('c')).send({ items: [{ listingId: ids.orderListing, quantity: 2.5 }] });
      expect(res.status).toBe(201);
      expect(Number(res.body.data.totalPrice)).toBeCloseTo(250);
      expect(res.body.data.items[0]).toMatchObject({ title: 'Order wheat', unit: 'kg' });
      expect(Number(res.body.data.items[0].priceAtPurchase)).toBe(100);
    });

    it('SEC-06: rejects client-supplied prices/titles outright', async () => {
      await http().post('/orders').set(auth('c')).send({ items: [{ listingId: ids.orderListing, quantity: 1, priceAtPurchase: 1 }] }).expect(400);
    });

    it('SEC-06: unknown listing 404, empty cart 400, too much quantity 400, own listing 400', async () => {
      await http().post('/orders').set(auth('c')).send({ items: [{ listingId: '00000000-0000-4000-8000-000000000000', quantity: 1 }] }).expect(404);
      await http().post('/orders').set(auth('c')).send({ items: [] }).expect(400);
      await http().post('/orders').set(auth('c')).send({ items: [{ listingId: ids.orderListing, quantity: 11 }] }).expect(400);
      await http().post('/orders').set(auth('a')).send({ items: [{ listingId: ids.orderListing, quantity: 1 }] }).expect(400);
    });

    it("lists only the caller's orders", async () => {
      const mine = await http().get('/orders/my').set(auth('c')).expect(200);
      expect(mine.body.data).toHaveLength(1);
      const other = await http().get('/orders/my').set(auth('b')).expect(200);
      expect(other.body.data).toHaveLength(0);
    });

    it('validates and requires auth', async () => {
      await http().post('/orders').set(auth('c')).send({}).expect(400);
      await http().post('/orders').send({ items: [{ listingId: ids.orderListing, quantity: 1 }] }).expect(401);
      await http().get('/orders/my').expect(401);
    });
  });

  describe('chats', () => {
    it('creates (idempotently) a direct chat, exchanges messages and enforces membership', async () => {
      const first = await http().post('/chats/direct').set(auth('b')).send({ participantUserId: ids.a });
      expect(first.status).toBe(201);
      const chatId = first.body.data.id;
      const again = await http().post('/chats/direct').set(auth('b')).send({ participantUserId: ids.a });
      expect(again.body.data.id).toBe(chatId);

      const sent = await http().post(`/chats/${chatId}/messages`).set(auth('b')).send({ body: 'Hello!' });
      expect(sent.status).toBe(201);
      const read = await http().get(`/chats/${chatId}/messages`).set(auth('a')).expect(200);
      expect(JSON.stringify(read.body)).toContain('Hello!');
      const list = await http().get('/chats').set(auth('a')).expect(200);
      expect(JSON.stringify(list.body)).toContain(chatId);

      const intruder = await http().get(`/chats/${chatId}/messages`).set(auth('c'));
      expect([403, 404]).toContain(intruder.status);
      const intruderPost = await http().post(`/chats/${chatId}/messages`).set(auth('c')).send({ body: 'spy' });
      expect([403, 404]).toContain(intruderPost.status);
    });

    it('lists community channels', async () => {
      await http().get('/chats/channels').set(auth('a')).expect(200);
    });

    it('validates payloads and requires auth', async () => {
      await http().post('/chats/direct').set(auth('a')).send({ participantUserId: 'x' }).expect(400);
      await http().get('/chats').expect(401);
    });

    it('cannot chat with yourself or a non-existent user', async () => {
      const self = await http().post('/chats/direct').set(auth('a')).send({ participantUserId: ids.a });
      expect(self.status).toBeGreaterThanOrEqual(400);
      const ghost = await http().post('/chats/direct').set(auth('a')).send({ participantUserId: '00000000-0000-4000-8000-000000000000' });
      expect(ghost.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('services', () => {
    const svc = () => ({
      category: 'agronomist', title: 'Field diagnostics', description: 'We check your fields', priceFrom: 20000,
      country: 'KZ', region: 'Алматинская', district: 'Талгар', locality: 'Талгар',
    });

    it('lists categories publicly', async () => {
      await http().get('/services/categories').expect(200);
    });

    it('creates, reads, filters and lists', async () => {
      const res = await http().post('/services').set(auth('a')).send(svc());
      expect([200, 201]).toContain(res.status);
      ids.service = res.body.id ?? res.body.data?.id;
      expect(ids.service).toEqual(expect.any(String));
      await http().get(`/services/${ids.service}`).expect(200);
      await http().get('/services').expect(200);
      const mine = await http().get('/services/mine').set(auth('a')).expect(200);
      expect(JSON.stringify(mine.body)).toContain(ids.service);
      await http().get('/services/providers/me').set(auth('a')).expect(200);
    });

    it('validates and requires auth', async () => {
      await http().post('/services').set(auth('a')).send({}).expect(400);
      await http().post('/services').send(svc()).expect(401);
    });

    it('only the owner can edit or delete', async () => {
      const notOwner = await http().patch(`/services/${ids.service}`).set(auth('b')).send({ title: 'pwn' });
      expect([403, 404]).toContain(notOwner.status);
      const notOwnerDel = await http().delete(`/services/${ids.service}`).set(auth('b'));
      expect([403, 404]).toContain(notOwnerDel.status);
      await http().patch(`/services/${ids.service}`).set(auth('a')).send({ title: 'Updated' }).expect(200);
      await http().delete(`/services/${ids.service}`).set(auth('a')).expect(200);
    });
  });

  describe('crops catalog', () => {
    it('lists crops publicly', async () => {
      await http().get('/crops').expect(200);
    });

    it('SEC-04: anonymous and non-admin users cannot modify the catalog', async () => {
      await http().post('/crops').send({ name: 'Anon crop', category: 'x' }).expect(401);
      await http().post('/crops').set(auth('a')).send({ name: 'Farmer crop', category: 'x' }).expect(403);
      await http().patch('/crops/00000000-0000-4000-8000-000000000000').set(auth('a')).send({ name: 'x' }).expect(403);
    });

    it('SEC-04: an admin can create and update; unknown fields are rejected', async () => {
      const login = await http().post('/auth/login').send({ phone: ADMIN_PHONE, password: ADMIN_PASSWORD }).expect(200);
      tokens.admin = login.body.access_token;
      const created = await http().post('/crops').set(auth('admin')).send({ name: 'E2E crop', category: 'grain' });
      expect(created.status).toBe(201);
      const id = created.body.id;
      await http().patch(`/crops/${id}`).set(auth('admin')).send({ name: 'E2E crop 2' }).expect(200);
      await http().patch(`/crops/${id}`).set(auth('admin')).send({ id: 'x' }).expect(400);
      await http().patch('/crops/not-a-uuid').set(auth('admin')).send({ name: 'x' }).expect(400);
      const list = await http().get('/crops').expect(200);
      expect(list.body.some((c: any) => c.name === 'E2E crop 2')).toBe(true);
    });
  });

  describe('analytics (PostGIS)', () => {
    it('region stats', async () => {
      const res = await http().get(`/analytics/region/${encodeURIComponent('Алматинская')}`).expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('overproduction risk', async () => {
      const res = await http().get('/analytics/overproduction-risk').query({ lat: 43.2, lng: 76.9, cropType: 'wheat', radiusKm: 25 }).expect(200);
      expect(res.body).toMatchObject({ cropType: 'wheat', riskLevel: expect.stringMatching(/LOW|MEDIUM|HIGH/) });
    });

    it('BUG-02: crop density returns 200 with an array', async () => {
      const res = await http().get('/analytics/crop-density').query({ lat: 43.2, lng: 76.9 }).expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('400 when required params are missing', async () => {
      await http().get('/analytics/overproduction-risk').query({ cropType: 'wheat' }).expect(400);
      await http().get('/analytics/crop-density').expect(400);
    });

    it('BUG-04: coordinate 0 is valid (equator / prime meridian)', async () => {
      await http().get('/analytics/crop-density').query({ lat: 0, lng: 0 }).expect(200);
      await http().get('/analytics/overproduction-risk').query({ lat: 0, lng: 0, cropType: 'wheat' }).expect(200);
    });

    it('out-of-range coordinates and radius are rejected with 400', async () => {
      await http().get('/analytics/crop-density').query({ lat: 95, lng: 0 }).expect(400);
      await http().get('/analytics/crop-density').query({ lat: 1, lng: 1, radiusKm: 99999 }).expect(400);
    });

    it('non-numeric coordinates are rejected with 400', async () => {
      await http().get('/analytics/crop-density').query({ lat: 'abc', lng: 'def' }).expect(400);
    });
  });

  describe('weather (provider stubbed)', () => {
    it('current, default route and forecast', async () => {
      const cur = await http().get('/weather/current').query({ lat: 43.2, lng: 76.9 }).expect(200);
      expect(cur.body.data.current).toMatchObject({ temperature: 21.5, summary: expect.any(String) });
      await http().get('/weather').query({ lat: 43.2, lon: 76.9 }).expect(200);
      const fc = await http().get('/weather/forecast').query({ lat: 43.2, lng: 76.9, days: 2 }).expect(200);
      expect(fc.body.data.forecast ?? fc.body.data).toBeDefined();
    });

    it('alerts', async () => {
      await http().get('/weather/alerts').query({ region: 'Алматинская', district: 'Талгар' }).expect(200);
    });

    it('400 without coordinates', async () => {
      await http().get('/weather/current').expect(400);
    });

    it('weather default route reports a missing longitude', async () => {
      const res = await http().get('/weather').query({ lat: 43.2 });
      expect(res.body.success).toBe(false);
    });
  });

  describe('dashboard & info center', () => {
    it.each(['/dashboard', '/dashboard/home', '/dashboard/notifications', '/dashboard/insights'])('GET %s', async (path) => {
      const res = await http().get(path).set(auth('a'));
      expect(res.status).toBe(200);
    });

    it.each(['/info-center/categories', '/info-center/feed', '/info-center/articles'])('GET %s', async (path) => {
      await http().get(path).set(auth('a')).expect(200);
    });

    it('all require auth', async () => {
      for (const p of ['/dashboard', '/info-center/feed']) await http().get(p).expect(401);
    });
  });

  describe('api usage', () => {
    it('stats and increments need auth; increments are counted', async () => {
      await http().get('/api-usage/stats').expect(401);
      await http().post('/api-usage/increment/google_maps').expect(401); // SEC-07
      const before = (await http().get('/api-usage/stats').set(auth('a')).expect(200)).body;
      const gm = before.find((r: any) => r.provider === 'google_maps');
      expect(gm).toBeDefined();
      await http().post('/api-usage/increment/google_maps').set(auth('a'));
      const after = (await http().get('/api-usage/stats').set(auth('a'))).body.find((r: any) => r.provider === 'google_maps');
      expect(after.callCount).toBe(gm.callCount + 1);
    });
  });
});
