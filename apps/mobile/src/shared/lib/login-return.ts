type ReturnStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const key = 'egin-login-return';
const legacyKey = 'egin-market-return';
const maxAge = 30 * 60 * 1000;

function allowed(destination: unknown): destination is string {
  return typeof destination === 'string' && destination.length <= 4096 && !/[\r\n]/.test(destination) &&
    (destination === '#/fields/new' || /^#\/market(?:\?[^#\r\n]*)?$/.test(destination));
}

/** Keep one explicit destination for this tab; never accept an external URL. */
export function rememberLoginReturn(destination: string, storage?: ReturnStore, now = Date.now()): boolean {
  if (!allowed(destination)) return false;
  try {
    const store = storage ?? sessionStorage;
    store.setItem(key, JSON.stringify({ destination, createdAt: now }));
    store.removeItem(legacyKey);
    return true;
  } catch { return false; }
}

export function consumeLoginReturn(storage?: ReturnStore, now = Date.now()): string {
  try {
    const store = storage ?? sessionStorage;
    const saved = store.getItem(key), legacy = store.getItem(legacyKey);
    store.removeItem(key);
    store.removeItem(legacyKey);
    if (saved) {
      const value = JSON.parse(saved);
      return allowed(value?.destination) && Number.isFinite(value.createdAt) &&
        value.createdAt <= now + 60000 && now - value.createdAt <= maxAge ? value.destination : '#/';
    }
    // Preserve an authentication flow begun before this version was deployed.
    if (allowed(legacy) && legacy.startsWith('#/market')) return legacy;
  } catch { /* Authentication still completes when tab storage is unavailable. */ }
  return '#/';
}
