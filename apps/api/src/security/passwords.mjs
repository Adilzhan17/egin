import argon2 from 'argon2';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const legacyOptions = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
// OWASP Argon2id minimum: 19 MiB, two iterations, one lane. These are
// server-owned parameters, never taken from an HTTP request.
const options = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1, hashLength: 32 };
const dummySalt = randomBytes(16);
let active = 0;
async function bounded(work) {
  // Reject overload instead of queuing unbounded memory/CPU-intensive work.
  if (active >= 4) throw Object.assign(new Error('Слишком много попыток входа. Повторите позже.'), { status: 429 });
  active++;
  try { return await work(); } finally { active--; }
}
export function isLegacyPassword(account) {
  return account && !Buffer.from(account.digest).toString('utf8').startsWith('$argon2id$');
}
export function hashPassword(password) {
  return bounded(async () => {
    const salt = randomBytes(16);
    const digest = Buffer.from(await argon2.hash(password, { ...options, salt }));
    return { salt, digest };
  });
}
export function verifyPassword(password, account) {
  return bounded(async () => {
    if (!account) {
      await argon2.hash(password, { ...options, salt: dummySalt });
      return false;
    }
    if (!isLegacyPassword(account)) return argon2.verify(Buffer.from(account.digest).toString('utf8'), password);
    const actual = await scrypt(password, Buffer.from(account.salt), 32, legacyOptions);
    const expected = Buffer.from(account.digest);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}
