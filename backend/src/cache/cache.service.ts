import { Injectable, OnModuleDestroy } from '@nestjs/common';

interface CacheEntry<T = unknown> {
  value: T;
  expiresAt: number;
}

/**
 * High-performance in-memory cache with TTL eviction.
 * Prevents redundant database queries to Supabase Cloud.
 *
 * Usage in any service:
 *   constructor(private readonly cache: CacheService) {}
 *   const data = await this.cache.get('key') ?? await this.fetchFromDb();
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private store = new Map<string, CacheEntry>();
  private timer: ReturnType<typeof setInterval>;

  constructor() {
    this.timer = setInterval(() => this.evict(), 60_000);
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /** Get a cached value. Returns null if missing or expired. */
  get<T = unknown>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  /** Cache a value with TTL in seconds (default 5 min). */
  set<T = unknown>(key: string, value: T, ttl = 300): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
  }

  /** Delete a specific key. */
  del(key: string): void {
    this.store.delete(key);
  }

  /** Delete all keys matching a prefix, e.g. 'farm-plots:'. */
  delByPrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  /** Flush all cached data. */
  reset(): void {
    this.store.clear();
  }

  /** Remove expired entries. */
  private evict(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }
}
