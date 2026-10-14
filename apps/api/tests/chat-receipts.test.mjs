import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { Pool } from 'pg';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { installChat } from '../src/chat/index.mjs';
import { migrateChat } from '../src/chat/migrations.mjs';

test('Chat API route inventory includes delivered/read snapshots without undocumented routes', async () => {
  const source = await readFile(new URL('../src/chat/index.mjs', import.meta.url), 'utf8') + await readFile(new URL('../src/chat/messenger.mjs', import.meta.url), 'utf8') + await readFile(new URL('../src/chat/presence.mjs', import.meta.url), 'utf8');
  const catalog = JSON.parse(await readFile(new URL('../src/catalog.json', import.meta.url), 'utf8'));
  const implemented = [...source.matchAll(/router\.(get|post|patch|delete|put)\('([^']+)'/g)].map(([, method, path]) => `${method.toUpperCase()} /api/chat${path.replace(/:([a-zA-Z]+)/g, '{$1}')}`).sort();
  const documented = catalog.filter(route => route.path.startsWith('/api/chat/')).map(route => `${route.method} ${route.path}`).sort();
  assert.deepEqual(documented, implemented);
});

// Isolated users, conversations, database and storage. Never authenticate against live services.
test('Chat receipts use committed sync/read ACKs, current membership and monotonic revisions', { skip: !process.env.CHAT_TEST_DATABASE_URL }, async t => {
  const databaseUrl = process.env.CHAT_TEST_DATABASE_URL, pool = new Pool({ connectionString: databaseUrl });
  const dataDir = await mkdtemp(tmpdir() + '/egin-receipts-'), db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT);CREATE TABLE sessions(id TEXT PRIMARY KEY,user_id TEXT,expires INTEGER);CREATE TABLE subscriptions(user_id TEXT,endpoint TEXT,data TEXT);');
  const users = Array.from({ length: 4 }, randomUUID), sessions = new Map();
  users.forEach((id, i) => { const sid = randomUUID(); sessions.set(id, sid); db.prepare('INSERT INTO users VALUES(?,?)').run(id, `Участник ${i}`); db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update(sid).digest('hex'), id, Date.now() + 120000); });
  function make() {
    const app = express(); app.use(express.json());
    app.use((req, _, next) => { const user = req.headers['x-test-user']; if (users.includes(user)) { req.user = { id: user }; req.sid = sessions.get(user); } next(); });
    const service = installChat({ app, db, dataDir, databaseUrl, required: (req, res, next) => req.user ? next() : res.status(401).json({ error: 'Войдите' }), wrap: fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next) });
    app.use((error, _, res, next) => { if (!error.status) console.error(error); res.status(error.status || 500).json({ error: error.message }); });
    return { app, service };
  }
  const slots = [make(), make()]; await Promise.all(slots.map(async slot => assert.equal(await slot.service.ready, true)));
  const servers = slots.map(slot => slot.app.listen(0, '127.0.0.1')); await Promise.all(servers.map(server => new Promise(resolve => server.once('listening', resolve))));
  const origins = servers.map(server => `http://127.0.0.1:${server.address().port}/api/chat`);
  async function call(path, { method = 'GET', body, user = users[0], slot = 0, headers = {} } = {}) {
    const response = await fetch(origins[slot] + path, { method, headers: { ...(user ? { 'x-test-user': user } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, ...await response.json() };
  }
  const send = async (id, text = 'Сообщение', user = users[0]) => { const result = await call(`/conversations/${id}/messages`, { method: 'POST', body: { clientId: randomUUID(), kind: 'text', text }, user }); assert.equal(result.status, 201, result.error); return result.message; };
  const ack = (id, kind, sequence, user = users[1], slot = 0) => call(`/conversations/${id}/${kind}`, { method: 'POST', body: { sequence }, user, slot });
  const snapshot = async (id, ids, user = users[0], slot = 0) => call(`/conversations/${id}/receipts${ids ? '?messageIds=' + ids.join(',') : ''}`, { user, slot });
  let direct, group, first, second;
  try {
    await t.test('starting an already-migrated API does not reacquire disruptive membership DDL locks', async () => {
      const client=await pool.connect();let migration,timer;
      try {
        await client.query('BEGIN');await client.query('LOCK TABLE chat_conversation_members IN SHARE MODE');
        migration=migrateChat(pool);
        const outcome=await Promise.race([migration.then(()=> 'ready'),new Promise(resolve=>{timer=setTimeout(()=>resolve('blocked'),1500);})]);
        assert.equal(outcome,'ready','An existing schema must not run ALTER/DROP TRIGGER while another slot serves traffic');
      }finally{clearTimeout(timer);await client.query('ROLLBACK');client.release();await migration;}
    });
    direct = (await call('/conversations', { method: 'POST', body: { kind: 'direct', userId: users[1] } })).conversation.id;
    await t.test('HTTP history and push scheduling do not prove delivery; only authorized explicit ACK advances it', async () => {
      first = await send(direct); assert.deepEqual(first.receipt, { recipientCount: 1, deliveredCount: 0, readCount: 0, version: first.receipt.version });
      await call(`/conversations/${direct}/messages`, { user: users[1], slot: 1 }); await call('/conversations', { user: users[1] });
      assert.equal((await snapshot(direct, [first.id])).items[0].receipt.deliveredCount, 0);
      assert.equal((await ack(direct, 'delivered', first.sequence, users[2])).status, 404);
      assert.equal((await ack(direct, 'delivered', first.sequence, null)).status, 401);
      assert.equal((await ack(direct, 'delivered', first.sequence + 1000000)).status, 422);
      assert.equal((await call(`/conversations/${direct}/delivered`, { method: 'POST', body: { sequence: first.sequence, userId: users[2] }, user: users[1] })).status, 400);
      assert.equal((await ack(direct, 'delivered', -1)).status, 400);
      assert.equal((await ack(direct, 'read', '1')).status, 400);
      const accepted = await ack(direct, 'delivered', first.sequence, users[1], 1); assert.equal(accepted.status, 200, accepted.error); assert.equal(accepted.readSequence, 0); assert.equal(accepted.deliveredSequence, first.sequence); assert.ok(accepted.serverAt.endsWith('Z'));
      const receipt = (await snapshot(direct, [first.id], users[0], 0)).items[0].receipt;
      assert.equal(receipt.deliveredCount, 1); assert.equal(receipt.readCount, 0); assert.ok(receipt.version > first.receipt.version);
      const unchanged = await ack(direct, 'delivered', first.sequence); assert.equal(unchanged.version, receipt.version);
      assert.equal((await ack(direct, 'delivered', 0)).version, receipt.version);
      assert.equal((await call(`/conversations/${direct}`, { user: users[1] })).conversation.unreadCount, 1);
    });
    await t.test('read is separate, implies received data, remains monotonic across devices, and hides incoming receipt details', async () => {
      const read = await ack(direct, 'read', first.sequence, users[1], 1); assert.equal(read.status, 200); assert.equal(read.readSequence, first.sequence); assert.equal(read.deliveredSequence, first.sequence);
      const version = read.version;
      const repeated = await ack(direct, 'read', 0); assert.equal(repeated.readSequence, first.sequence); assert.equal(repeated.version, version);
      const own = (await call(`/conversations/${direct}/messages`)).items.find(message => message.id === first.id); assert.equal(own.receipt.readCount, 1); assert.equal(own.readByCount, 1);
      const incoming = (await call(`/conversations/${direct}/messages`, { user: users[1] })).items.find(message => message.id === first.id); assert.equal(incoming.receipt, null); assert.equal(incoming.readByCount, 0);
      assert.deepEqual((await snapshot(direct, [first.id], users[1])).items, []);
      assert.equal((await call(`/conversations/${direct}`, { user: users[1] })).conversation.unreadCount, 0);
      second = await send(direct, 'Следующее сообщение');
      const result = await ack(direct, 'read', second.sequence); assert.equal(result.deliveredSequence, second.sequence);
      const late = await ack(direct, 'delivered', first.sequence, users[1], 1); assert.equal(late.deliveredSequence, second.sequence); assert.equal(late.readSequence, second.sequence); assert.equal(late.version, result.version);
      assert.equal((await snapshot(direct)).items.find(row => row.messageId === second.id).receipt.readCount, 1);
    });
    await t.test('receipt events travel across API slots with server timestamps, account sequence and revision', async () => {
      const third = await send(direct, 'Проверка realtime'), controller = new AbortController();
      const response = await fetch(origins[1] + '/events', { headers: { 'x-test-user': users[0] }, signal: controller.signal }), reader = response.body.getReader();
      let data = new TextDecoder().decode((await reader.read()).value); assert.match(data, /event: ready/);
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const accepted = await ack(direct, 'delivered', third.sequence);
        while (!/event: message\.delivered\ndata: [^\n]+\n\nevent: change\ndata: [^\n]+\n\n/.test(data)) data += new TextDecoder().decode((await reader.read()).value);
        const event = JSON.parse(data.split('event: message.delivered\ndata: ')[1].split('\n')[0]);
        assert.deepEqual(event, { conversationId: direct, version: accepted.version, userId: users[1], sequence: third.sequence, serverAt: accepted.serverAt });
        assert.ok(!data.includes('Проверка realtime'));
        data = ''; const read = await ack(direct, 'read', third.sequence);
        while (!/event: message\.read\ndata: [^\n]+\n\n/.test(data)) data += new TextDecoder().decode((await reader.read()).value);
        const readEvent = JSON.parse(data.split('event: message.read\ndata: ')[1].split('\n')[0]); assert.equal(readEvent.version, read.version); assert.ok(readEvent.version > event.version);
      } finally { clearTimeout(timer); controller.abort(); }
    });
    await t.test('group denominator follows current read-eligible membership; join, leave and rejoin cannot invent reads', async () => {
      group = (await call('/groups', { method: 'POST', body: { name: 'Проверка статусов', category: 'agronomy', access: 'public' } })).conversation.id;
      await call(`/groups/${group}/join`, { method: 'POST', body: {}, user: users[1] });
      const message = await send(group), get = async () => (await snapshot(group, [message.id])).items[0].receipt;
      assert.deepEqual(await get(), { recipientCount: 1, deliveredCount: 0, readCount: 0, version: message.receipt.version });
      await ack(group, 'read', message.sequence); const beforeJoin = await get(); assert.equal(beforeJoin.readCount, 1);
      await call(`/groups/${group}/join`, { method: 'POST', body: {}, user: users[2] }); const joined = await get(); assert.equal(joined.recipientCount, 2); assert.equal(joined.readCount, 1); assert.ok(joined.version > beforeJoin.version);
      await call(`/groups/${group}/members/${users[2]}`, { method: 'PATCH', body: { canWrite: false } });
      assert.equal((await ack(group, 'delivered', message.sequence, users[2], 1)).status, 200);
      let state = await get(); assert.equal(state.deliveredCount, 2); assert.equal(state.readCount, 1); assert.equal(state.recipientCount, 2);
      await ack(group, 'read', message.sequence, users[2]); state = await get(); assert.equal(state.readCount, 2);
      await call(`/groups/${group}/leave`, { method: 'POST', body: {}, user: users[2] }); const left = await get(); assert.equal(left.recipientCount, 1); assert.equal(left.readCount, 1); assert.ok(left.version > state.version);
      assert.equal((await ack(group, 'read', message.sequence, users[2])).status, 404); assert.equal((await snapshot(group, [message.id], users[2])).status, 404);
      assert.equal((await pool.query('SELECT 1 FROM chat_message_receipts WHERE conversation_id=$1 AND user_id=$2', [group, users[2]])).rowCount, 0);
      await call(`/groups/${group}/join`, { method: 'POST', body: {}, user: users[2] }); const rejoined = await get(); assert.equal(rejoined.recipientCount, 2); assert.equal(rejoined.readCount, 1); assert.equal(rejoined.deliveredCount, 1); assert.ok(rejoined.version > left.version);
      const fresh = await snapshot(group, undefined, users[2]); assert.deepEqual(fresh.self, { deliveredSequence: 0, readSequence: 0 });
      assert.equal((await ack(group, 'read', first.sequence, users[2])).status, 422);
      // A sender's own ACK does not count as delivery to other members.
      await ack(group, 'delivered', message.sequence, users[0]); assert.equal((await get()).deliveredCount, 1);
    });
    await t.test('concurrent and legacy-slot cursor writes keep the revision and counts consistent', async () => {
      const a = await send(group, 'А'), b = await send(group, 'Б');
      const before = await snapshot(group, [a.id, b.id]);
      await Promise.all([ack(group, 'read', b.sequence, users[1], 1), ack(group, 'delivered', a.sequence, users[1], 0), ack(group, 'read', a.sequence, users[1], 0)]);
      const after = await snapshot(group, [a.id, b.id]); assert.ok(after.version > before.version); assert.ok(after.items.every(row => row.receipt.readCount === 1 && row.receipt.deliveredCount === 1 && row.receipt.version === after.version));
      // Old slots update last_read_sequence directly; DB triggers keep new delivery/revision in sync.
      await pool.query('UPDATE chat_conversation_members SET last_read_sequence=$3 WHERE conversation_id=$1 AND user_id=$2', [group, users[2], b.sequence]);
      const legacy = await snapshot(group, [b.id]); assert.equal(legacy.items[0].receipt.readCount, 2); assert.equal(legacy.items[0].receipt.deliveredCount, 2); assert.ok(legacy.version > after.version);
      await pool.query('UPDATE chat_conversation_members SET last_read_sequence=0,last_delivered_sequence=0 WHERE conversation_id=$1 AND user_id=$2', [group, users[2]]);
      const stale = await snapshot(group, [b.id]); assert.equal(stale.version, legacy.version); assert.equal(stale.items[0].receipt.readCount, 2);
    });
    await t.test('bounded snapshots expose only own live messages and enforce membership', async () => {
      assert.equal((await snapshot(direct, [first.id], users[3])).status, 404);
      assert.equal((await snapshot(direct, Array(101).fill(first.id))).status, 400);
      assert.equal((await call(`/conversations/${direct}/receipts?messageIds=invalid`)).status, 400);
      assert.equal((await call(`/conversations/${direct}/receipts?messageIds=`)).status, 400);
      const own = await send(direct, 'Удаляем статус'); await call(`/conversations/${direct}/messages/${own.id}`, { method: 'DELETE' });
      assert.deepEqual((await snapshot(direct, [own.id])).items, []);
      const tombstone = (await call(`/conversations/${direct}/messages`)).items.find(row => row.id === own.id); assert.equal(tombstone.receipt, null); assert.equal(tombstone.readByCount, 0);
      const result = await snapshot(direct); assert.ok(result.items.every(row => row.receipt.version === result.version)); assert.ok(result.items.length <= 50);
    });
    await t.test('a persisted outbox cannot be sent or uploaded under a changed session account', async () => {
      const body = { clientId: randomUUID(), kind: 'text', text: 'Очередь исходного профиля' };
      const denied = await call(`/conversations/${direct}/messages`, { method: 'POST', body, user: users[1], headers: { 'X-EGIN-Outbox-User': users[0] } });
      assert.equal(denied.status, 403);
      assert.equal((await pool.query('SELECT 1 FROM chat_messages WHERE client_id=$1', [body.clientId])).rowCount, 0);
      const upload = await fetch(origins[0] + `/conversations/${direct}/attachments?kind=audio&name=voice.wav`, { method: 'POST', headers: { 'x-test-user': users[1], 'X-EGIN-Outbox-User': users[0], 'Content-Type': 'application/octet-stream' }, body: Buffer.from('invalid bytes must never reach the media processor') });
      assert.equal(upload.status, 403);
      const restored = await call(`/conversations/${direct}/messages`, { method: 'POST', body, headers: { 'X-EGIN-Outbox-User': users[0] } });
      assert.equal(restored.status, 201, restored.error);
      const repeated = await call(`/conversations/${direct}/messages`, { method: 'POST', body, headers: { 'X-EGIN-Outbox-User': users[0] } });
      assert.equal(repeated.status, 200); assert.equal(repeated.message.id, restored.message.id);
    });
  } finally {
    await Promise.all(slots.map(slot => slot.service.close())); await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
    await pool.query('DELETE FROM chat_conversations WHERE id IN(SELECT conversation_id FROM chat_conversation_members WHERE user_id=ANY($1::text[]))', [users]);
    await pool.end(); db.close(); await rm(dataDir, { recursive: true, force: true });
  }
});
