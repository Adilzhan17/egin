import { randomInt } from 'node:crypto';
import { generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';

export function installQRAuth({ app, db, required, wrap, rpID, expectedOrigins, session, challenge, consume, hash, token, secure, origin }) {
  db.exec(`CREATE TABLE IF NOT EXISTS qr_logins(id TEXT PRIMARY KEY, browser TEXT NOT NULL, code TEXT NOT NULL, device TEXT NOT NULL, expires INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', user_id TEXT REFERENCES users(id));`);
  const fail = (status, message) => Object.assign(new Error(message), { status });
  const cookie = req => (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('egin_qr='))?.slice(8);
  const setCookie = (res, value, age) => res.append('Set-Cookie', `egin_qr=${value}; HttpOnly; Path=/api/auth/qr; SameSite=Strict; Max-Age=${age}${secure ? '; Secure' : ''}`);
  const read = id => {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(id)) throw fail(400, 'Некорректный QR входа');
    const row = db.prepare('SELECT * FROM qr_logins WHERE id=?').get(hash(id));
    if (!row || row.expires <= Date.now()) throw fail(410, 'QR истёк. Создайте новый код на устройстве входа.');
    return row;
  };
  const browserRow = req => { const row = read(req.body.id); const secret = cookie(req); if (!secret || hash(secret) !== row.browser) throw fail(403, 'Этот QR создан в другом браузере.'); return row; };
  const publicRow = row => ({ code: row.code, device: row.device, expires: row.expires, status: row.status });
  app.post('/api/auth/qr/start', (req, res) => {
    db.prepare('DELETE FROM qr_logins WHERE expires<=?').run(Date.now());
    if (cookie(req)) db.prepare('DELETE FROM qr_logins WHERE browser=?').run(hash(cookie(req)));
    const id = token(), browser = token(), code = String(randomInt(100000, 1000000)), expires = Date.now() + 120000;
    const ua = req.headers['user-agent'] || '';
    const device = `${/Firefox/i.test(ua) ? 'Firefox' : /Edg/i.test(ua) ? 'Edge' : /Chrome/i.test(ua) ? 'Chrome' : /Safari/i.test(ua) ? 'Safari' : 'Браузер'} · ${/Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone / iPad' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : 'компьютер'}`;
    db.prepare('INSERT INTO qr_logins(id,browser,code,device,expires) VALUES(?,?,?,?,?)').run(hash(id), hash(browser), code, device, expires);
    setCookie(res, browser, 120);
    res.json({ id, code, device, expires, url: `${origin}/#/auth/confirm/${id}` });
  });
  app.post('/api/auth/qr/poll', (req, res) => {
    const row = browserRow(req);
    if (row.status !== 'approved') return res.json(publicRow(row));
    // DELETE ... RETURNING consumes the approval atomically, including concurrent polls.
    const consumed = db.prepare("DELETE FROM qr_logins WHERE id=? AND status='approved' AND expires>? RETURNING user_id").get(row.id, Date.now());
    if (!consumed) throw fail(410, 'Этот QR уже использован.');
    const user = db.prepare('SELECT id,name FROM users WHERE id=?').get(consumed.user_id);
    if (!user) throw fail(410, 'Профиль недоступен.');
    session(res, user.id); setCookie(res, '', 0);
    res.json({ status: 'complete', user });
  });
  app.post('/api/auth/qr/cancel', (req, res) => { const row = browserRow(req); db.prepare('DELETE FROM qr_logins WHERE id=?').run(row.id); setCookie(res, '', 0); res.json({ ok: true }); });
  app.get('/api/auth/qr/:id', required, (req, res) => res.json(publicRow(read(req.params.id))));
  app.post('/api/auth/qr/:id/reject', required, (req, res) => { const row = read(req.params.id); db.prepare("UPDATE qr_logins SET status='denied' WHERE id=? AND status='pending'").run(row.id); res.json({ ok: true }); });
  app.post('/api/auth/qr/:id/options', required, wrap(async (req, res) => {
    const row = read(req.params.id); if (row.status !== 'pending') throw fail(409, 'Этот запрос уже обработан.');
    const credentials = db.prepare('SELECT id,transports FROM credentials WHERE user_id=?').all(req.user.id);
    if (!credentials.length) throw fail(409, 'Сначала добавьте passkey в настройках безопасности.');
    const options = await generateAuthenticationOptions({ rpID, userVerification: 'required', allowCredentials: credentials.map(k => ({ id: k.id, transports: JSON.parse(k.transports || '[]') })) });
    res.json(challenge('qr-approve', options, req.user.id, req.params.id));
  }));
  app.post('/api/auth/qr/:id/verify', required, wrap(async (req, res) => {
    const row = read(req.params.id), c = consume(req.body.flow, 'qr-approve');
    if (c.user_id !== req.user.id || c.name !== req.params.id || row.status !== 'pending') throw fail(403, 'Запрос входа изменился.');
    const key = db.prepare('SELECT * FROM credentials WHERE id=? AND user_id=?').get(req.body.response?.id || '', req.user.id);
    if (!key) throw fail(403, 'Ключ не принадлежит этому профилю.');
    const result = await verifyAuthenticationResponse({ response: req.body.response, expectedChallenge: c.challenge, expectedOrigin: expectedOrigins, expectedRPID: rpID, requireUserVerification: true, credential: { id: key.id, publicKey: new Uint8Array(key.public_key), counter: key.counter, transports: JSON.parse(key.transports || '[]') } });
    if (!result.verified) throw fail(403, 'Passkey не подтверждён.');
    db.prepare('UPDATE credentials SET counter=? WHERE id=?').run(result.authenticationInfo.newCounter, key.id);
    const changed = db.prepare("UPDATE qr_logins SET status='approved',user_id=? WHERE id=? AND status='pending' AND expires>?").run(req.user.id, row.id, Date.now());
    if (!changed.changes) throw fail(410, 'QR истёк или уже использован.');
    res.json({ ok: true });
  }));
}
