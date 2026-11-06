import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { createApp } from '../src/server.mjs';
import { hashPassword } from '../src/security/passwords.mjs';
import { validateProductionConfig } from '../src/security/http.mjs';
import { gzipSync } from 'node:zlib';

const hash = s => createHash('sha256').update(s).digest('hex');
test('production configuration rejects HTTP origins and mismatched relying parties without echoing secrets', () => {
  const valid = { origins: ['https://egin.example'], portalOrigin: 'https://api.egin.example', rpID: 'egin.example' };
  assert.doesNotThrow(() => validateProductionConfig(valid, true));
  assert.throws(() => validateProductionConfig({ ...valid, origins: ['http://localhost'] }, true), /HTTPS/);
  assert.throws(() => validateProductionConfig({ ...valid, rpID: 'unrelated.example' }, true), /RP_ID/);
  assert.throws(() => validateProductionConfig({ ...valid, portalOrigin: 'https://secret:password@example.com' }, true), error => !error.message.includes('secret') && !error.message.includes('password'));
  const local = { origins: ['http://localhost:4934'], portalOrigin: 'http://localhost:4938', rpID: 'localhost' };
  assert.throws(() => validateProductionConfig(local, true, false), /HTTPS/);
  assert.doesNotThrow(() => validateProductionConfig(local, true, true));
  assert.throws(() => validateProductionConfig({ ...local, origins: ['http://egin.example'] }, true, true), /HTTPS/);
  assert.throws(() => validateProductionConfig({ ...local, portalOrigin: 'http://portal.example' }, true, true), /HTTPS/);
});
async function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'egin-security-'));
  const service = createApp({ dataDir: dir, origins: ['http://localhost'], portalOrigin: 'http://portal.localhost' });
  const server = service.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { service.close(); await new Promise(r => server.close(r)); service.db.close(); rmSync(dir, { recursive: true, force: true }); });
  const post = (path, data, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'X-EGIN': '1', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data) });
  return { ...service, base, post };
}

test('API applies restrictive response headers and rejects compressed JSON before decompression', async t => {
  const { base } = await fixture(t);
  const response = await fetch(base + '/api/auth/password/login', { method: 'POST', headers: { 'X-EGIN': '1', 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' }, body: Buffer.concat([gzipSync('{}'), Buffer.from('invalid trailing frame')]) });
  assert.equal(response.status, 415);
  const health = await fetch(base + '/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(health.headers.get('x-frame-options'), 'DENY');
  assert.match(health.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(health.headers.get('x-powered-by'), null);
});

test('recovery revokes app/portal sessions, API keys, approved QR and outstanding challenges for that owner', async t => {
  const { db, base, post } = await fixture(t);
  for (const id of ['victim', 'other']) {
    db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(id, id, hash(id + '-recovery'), Date.now());
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(id + '-session'), id, Date.now() + 60000);
    db.prepare('INSERT INTO developer_sessions VALUES(?,?,?)').run(hash(id + '-portal'), id, Date.now() + 60000);
    db.prepare('INSERT INTO challenges VALUES(?,?,?,?,?,?)').run(id, 'add', 'challenge', id, id, Date.now() + 60000);
    db.prepare("INSERT INTO qr_logins(id,browser,code,device,expires,status,user_id) VALUES(?,?,?,'browser',?,'approved',?)").run(id, 'browser', '123456', Date.now() + 60000, id);
    db.prepare('INSERT INTO api_keys(id,user_id,name,open_key,secret_hash,hint,scopes,created,expires) VALUES(?,?,?,?,?,?,?,?,?)').run(id, id, 'key', id, hash(id), 'hint', '[]', Date.now(), Date.now() + 60000);
  }
  const r = await post('/api/auth/recover', { code: 'victim-recovery' });
  assert.equal(r.status, 200);
  assert.ok(r.headers.get('set-cookie').includes('HttpOnly'));
  for (const table of ['sessions', 'developer_sessions', 'challenges', 'qr_logins']) {
    // Recovery creates exactly one new app session, and removes the old one.
    if (table !== 'sessions') assert.equal(db.prepare(`SELECT count(*) n FROM ${table} WHERE user_id=?`).get('victim').n, 0);
    assert.equal(db.prepare(`SELECT count(*) n FROM ${table} WHERE user_id=?`).get('other').n, 1);
  }
  assert.equal(db.prepare('SELECT 1 FROM sessions WHERE id=?').get(hash('victim-session')), undefined);
  assert.ok(db.prepare('SELECT revoked FROM api_keys WHERE user_id=?').get('victim').revoked);
  assert.equal(db.prepare('SELECT revoked FROM api_keys WHERE user_id=?').get('other').revoked, null);
  assert.equal((await fetch(base + '/api/developer/session', { headers: { Cookie: 'egin_developer=victim-portal' } }).then(r => r.json())).user, null);
  assert.equal((await post('/api/auth/recover', { code: 'victim-recovery' })).status, 400);
});

test('scrypt accounts migrate to Argon2id on successful login and password reset revokes portal/API access', async t => {
  const { db, post } = await fixture(t);
  const password = 'a sufficiently long legacy password', salt = randomBytes(16);
  const digest = scryptSync(password, salt, 32, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
  db.prepare('INSERT INTO users VALUES(?,?,?,?)').run('legacy', 'Legacy', hash('recovery'), Date.now());
  db.prepare('INSERT INTO password_accounts VALUES(?,?,?,?,?)').run('legacy', 'legacy@example.com', salt, digest, Date.now());
  const wrong = await post('/api/auth/password/login', { email: 'legacy@example.com', password: 'wrong' });
  assert.equal(wrong.status, 401);
  assert.deepEqual(Buffer.from(db.prepare('SELECT digest FROM password_accounts').get().digest), digest);
  const login = await post('/api/auth/password/login', { email: 'legacy@example.com', password });
  assert.equal(login.status, 200);
  assert.match(Buffer.from(db.prepare('SELECT digest FROM password_accounts').get().digest).toString(), /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  assert.equal((await post('/api/auth/password/login', { email: 'legacy@example.com', password })).status, 200);
  db.prepare('INSERT INTO developer_sessions VALUES(?,?,?)').run('portal', 'legacy', Date.now() + 60000);
  const reset = await post('/api/auth/password/reset', { email: 'legacy@example.com', code: 'recovery', password: 'new secure password for this user' });
  assert.equal(reset.status, 200);
  assert.equal(db.prepare('SELECT count(*) n FROM developer_sessions').get().n, 0);
  assert.equal((await post('/api/auth/password/login', { email: 'legacy@example.com', password })).status, 401);
});

test('concurrent bad logins reserve account attempts before hashing; forwarded IP spoofing cannot bypass direct API limits', async t => {
  const { db, post } = await fixture(t);
  const responses = await Promise.all(Array.from({ length: 20 }, (_, i) => post('/api/auth/password/login', { email: 'target@example.com', password: 'wrong' }, { 'X-Real-IP': `198.51.100.${i}`, 'X-Forwarded-For': `198.51.100.${i}` })));
  assert.ok(responses.filter(r => r.status === 401).length <= 8);
  assert.ok(responses.filter(r => r.status === 429).length >= 12);
  assert.equal(db.prepare('SELECT failures FROM password_attempts WHERE email_key=?').get(hash('target@example.com')).failures, 8);
  for (let i = 0; i < 20; i++) await post('/api/auth/password/login', { email: 'target@example.com', password: 'wrong' }, { 'X-Real-IP': `192.0.2.${i}` });
  const denied = await post('/api/auth/password/login', { email: 'another@example.com', password: 'wrong' }, { 'X-Real-IP': '203.0.113.88', 'X-Forwarded-For': '203.0.113.88' });
  assert.equal(denied.status, 429);
  assert.ok(denied.headers.get('retry-after'));
});

test('a recovery during asynchronous password verification prevents issuing a stale login session', async t => {
  const { db, post } = await fixture(t);
  const password = 'a password long enough to verify', { salt, digest } = await hashPassword(password);
  db.prepare('INSERT INTO users VALUES(?,?,?,?)').run('race', 'Race', hash('before'), Date.now());
  db.prepare('INSERT INTO password_accounts VALUES(?,?,?,?,?)').run('race', 'race@example.com', salt, digest, Date.now());
  const pending = post('/api/auth/password/login', { email: 'race@example.com', password });
  const deadline = Date.now() + 5000;
  while (!db.prepare('SELECT 1 FROM password_attempts').get()) {
    assert.ok(Date.now() < deadline, 'login started');
    await new Promise(r => setTimeout(r, 1));
  }
  db.prepare('UPDATE users SET recovery=? WHERE id=?').run(hash('after'), 'race');
  const response = await pending;
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('set-cookie'), null);
});
