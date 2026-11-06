import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { migrateChat } from '../src/chat/migrations.mjs';
import { migrateMessenger } from '../src/chat/messenger.mjs';
import { migrateMarket } from '../src/market/migrations.mjs';

const url = process.env.CHAT_TEST_DATABASE_URL;
test('Chat and Market initialize concurrently against a fresh database', { skip: !url, timeout: 30000 }, async () => {
  const admin = new pg.Client({ connectionString: url });
  const name = 'egin_migration_' + randomBytes(8).toString('hex');
  let pool;
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    const database = new URL(url); database.pathname = '/' + name;
    pool = new pg.Pool({ connectionString: database.href });
    await migrateChat(pool);
    await Promise.all([migrateMessenger(pool), migrateMarket(pool)]);
    const result = await pool.query("SELECT extname FROM pg_extension WHERE extname='pg_trgm'");
    assert.equal(result.rowCount, 1);
    await Promise.all([migrateMessenger(pool), migrateMarket(pool)]);
  } finally {
    if (pool) await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.end();
  }
});
