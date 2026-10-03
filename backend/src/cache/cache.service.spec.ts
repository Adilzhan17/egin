import { CacheService } from './cache.service';

describe('CacheService', () => {
  let cache: CacheService;

  beforeEach(() => {
    jest.useFakeTimers();
    cache = new CacheService();
  });

  afterEach(() => {
    cache.onModuleDestroy();
    jest.useRealTimers();
  });

  it('stores and returns values', () => {
    cache.set('k', { a: 1 });
    expect(cache.get('k')).toEqual({ a: 1 });
  });

  it('returns null for missing keys', () => {
    expect(cache.get('missing')).toBeNull();
  });

  it('expires entries after the TTL', () => {
    cache.set('k', 'v', 10);
    jest.advanceTimersByTime(9_999);
    expect(cache.get('k')).toBe('v');
    jest.advanceTimersByTime(2);
    expect(cache.get('k')).toBeNull();
  });

  it('defaults to a 5 minute TTL', () => {
    cache.set('k', 'v');
    jest.advanceTimersByTime(299_000);
    expect(cache.get('k')).toBe('v');
    jest.advanceTimersByTime(2_000);
    expect(cache.get('k')).toBeNull();
  });

  it('deletes single keys and prefixes', () => {
    cache.set('plots:1', 1);
    cache.set('plots:2', 2);
    cache.set('other', 3);
    cache.del('plots:1');
    expect(cache.get('plots:1')).toBeNull();
    cache.delByPrefix('plots:');
    expect(cache.get('plots:2')).toBeNull();
    expect(cache.get('other')).toBe(3);
  });

  it('reset flushes everything', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.reset();
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBeNull();
  });

  it('background eviction removes expired entries', () => {
    cache.set('a', 1, 1);
    jest.advanceTimersByTime(61_000);
    expect((cache as any).store.size).toBe(0);
  });
});
