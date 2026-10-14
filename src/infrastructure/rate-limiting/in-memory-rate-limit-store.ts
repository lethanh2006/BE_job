import {
  RateLimitCounter,
  RateLimitStore,
} from '../../application/abstractions/rate-limiting';

export class InMemoryRateLimitStore extends RateLimitStore {
  private readonly counters = new Map<string, RateLimitCounter>();

  constructor(private readonly maxKeys = 100_000) {
    super();
  }

  hit(key: string, windowMs: number, now: number): Promise<RateLimitCounter> {
    const current = this.counters.get(key);
    if (current && current.resetAt > now) {
      current.count += 1;
      return Promise.resolve({ ...current });
    }

    this.makeRoom(now);
    const fresh = { count: 1, resetAt: now + windowMs };
    this.counters.set(key, fresh);
    return Promise.resolve({ ...fresh });
  }

  peek(key: string, now: number): Promise<RateLimitCounter | null> {
    const current = this.counters.get(key);
    return Promise.resolve(
      current && current.resetAt > now ? { ...current } : null,
    );
  }

  reset(key: string): Promise<void> {
    this.counters.delete(key);
    return Promise.resolve();
  }

  /** Giữ bộ nhớ có giới hạn: khi đầy thì dọn bản ghi hết hạn, vẫn đầy thì bỏ bản ghi cũ nhất. */
  private makeRoom(now: number): void {
    if (this.counters.size < this.maxKeys) return;

    for (const [key, counter] of this.counters) {
      if (counter.resetAt <= now) this.counters.delete(key);
    }
    while (this.counters.size >= this.maxKeys) {
      const oldest = this.counters.keys().next();
      if (oldest.done) break;
      this.counters.delete(oldest.value);
    }
  }
}
