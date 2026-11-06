import { createHash, randomBytes } from 'node:crypto';

export const SESSION_IDLE_MS = 24 * 3600000;
export const SESSION_MAX_MS = 30 * 86400000;
export const FRESH_AUTH_MS = 10 * 60000;
export const MFA_MAX_MS = 12 * 3600000;
const hash = value => createHash('sha256').update(value).digest('hex');

// The table names are selected by server code, never by request input. Keep
// activity separate so legacy sessions migrate without changing their shape.
export function createSessionManager(db, { portal = false } = {}) {
  const table = portal ? 'developer_sessions' : 'sessions';
  const activity = portal ? 'developer_session_security' : 'session_security';
  const idleMs = portal ? 30 * 60000 : SESSION_IDLE_MS;
  const maxMs = portal ? MFA_MAX_MS : SESSION_MAX_MS;
  db.exec(`CREATE TABLE IF NOT EXISTS ${activity}(
    session_id TEXT PRIMARY KEY REFERENCES ${table}(id) ON DELETE CASCADE,
    created INTEGER NOT NULL, last_seen INTEGER NOT NULL,
    authenticated_at INTEGER NOT NULL DEFAULT 0,
    assurance TEXT NOT NULL DEFAULT 'legacy');
    CREATE INDEX IF NOT EXISTS ${table}_owner_expiry ON ${table}(user_id, expires);
    CREATE TRIGGER IF NOT EXISTS ${activity}_insert AFTER INSERT ON ${table} BEGIN
      INSERT INTO ${activity}(session_id,created,last_seen) VALUES(NEW.id,unixepoch('subsec')*1000,unixepoch('subsec')*1000);
    END;
    INSERT OR IGNORE INTO ${activity}(session_id,created,last_seen)
      SELECT id,unixepoch('subsec')*1000,unixepoch('subsec')*1000 FROM ${table};`);

  function read(secret, { touch = false } = {}) {
    if (typeof secret !== 'string' || !secret || secret.length > 256) return null;
    const id = hash(secret), now = Date.now();
    const row = db.prepare(`SELECT u.*,a.created AS session_created,a.last_seen,a.authenticated_at,a.assurance,s.expires
      FROM ${table} s JOIN users u ON u.id=s.user_id JOIN ${activity} a ON a.session_id=s.id WHERE s.id=?`).get(id);
    if (!row) return null;
    if (row.expires <= now || row.session_created + maxMs <= now || row.last_seen + idleMs <= now) {
      db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id);
      return null;
    }
    if (touch) db.prepare(`UPDATE ${activity} SET last_seen=? WHERE session_id=?`).run(now, id);
    return { user: { id: row.id, name: row.name, recovery: row.recovery, created: row.created },
      security: { authenticatedAt: row.authenticated_at, assurance: row.assurance } };
  }

  function issue(userId, assurance = 'recovery', previousSecret) {
    if (!['password', 'recovery', 'passkey'].includes(assurance)) throw Error('Invalid session assurance');
    const secret = randomBytes(32).toString('base64url'), id = hash(secret), now = Date.now();
    db.prepare(`DELETE FROM ${table} WHERE expires<=?`).run(now);
    // Reauthentication replaces the current browser session. Other devices
    // remain usable until logout/recovery or the bounded session limit.
    if (previousSecret) db.prepare(`DELETE FROM ${table} WHERE id=?`).run(hash(previousSecret));
    db.prepare(`INSERT INTO ${table} VALUES(?,?,?)`).run(id, userId, now + maxMs);
    db.prepare(`UPDATE ${activity} SET created=?,last_seen=?,authenticated_at=?,assurance=? WHERE session_id=?`).run(now, now, now, assurance, id);
    db.prepare(`DELETE FROM ${table} WHERE user_id=? AND id<>? AND id NOT IN(
      SELECT s.id FROM ${table} s JOIN ${activity} a ON a.session_id=s.id WHERE s.user_id=? AND s.id<>? ORDER BY a.created DESC,s.id LIMIT 9
    )`).run(userId, id, userId, id);
    return secret;
  }
  return { read, issue };
}

export function isFresh(security, { mfa = false } = {}) {
  if (!security || security.authenticatedAt > Date.now()) return false;
  return security.authenticatedAt + (mfa ? MFA_MAX_MS : FRESH_AUTH_MS) > Date.now()
    && (mfa ? security.assurance === 'passkey' : ['passkey', 'password'].includes(security.assurance));
}
