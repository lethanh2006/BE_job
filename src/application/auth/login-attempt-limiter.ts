import { Clock } from '../../domain';
import {
  RateLimitStore,
  secondsUntil,
  waitPhrase,
} from '../abstractions/rate-limiting';
import { TooManyRequestsException } from '../exceptions';

/** Sai quá số lần này từ cùng một IP với cùng một email thì tạm khóa cặp đó. */
export const MAX_FAILURES_PER_CLIENT = 8;
export const CLIENT_WINDOW_MS = 15 * 60 * 1000;
/** Ngưỡng rộng hơn cho toàn bộ IP, chặn đoán mật khẩu phân tán nhưng khó bị lợi dụng để khóa người khác. */
export const MAX_FAILURES_PER_ACCOUNT = 40;
export const ACCOUNT_WINDOW_MS = 60 * 60 * 1000;

/**
 * Chỉ đếm lần đăng nhập SAI (kể cả email không tồn tại, để không lộ tài khoản nào có thật).
 * Khóa theo cặp (email, IP) nên kẻ tấn công không thể khóa chủ tài khoản khỏi chính IP của họ;
 * ngưỡng theo tài khoản cao hơn nhiều chỉ để chặn đoán phân tán. Đăng nhập đúng xóa bộ đếm.
 */
export class LoginAttemptLimiter {
  constructor(
    private readonly store: RateLimitStore,
    private readonly clock: Clock,
    private readonly enabled = true,
  ) {}

  async assertAllowed(email: string, client?: string): Promise<void> {
    if (!this.enabled) return;

    const now = this.clock.utcNow.getTime();
    const checks: [string, number][] = [
      [this.clientKey(email, client), MAX_FAILURES_PER_CLIENT],
      [this.accountKey(email), MAX_FAILURES_PER_ACCOUNT],
    ];
    for (const [key, max] of checks) {
      const counter = await this.store.peek(key, now);
      if (counter && counter.count >= max) {
        const seconds = secondsUntil(counter.resetAt, now);
        throw new TooManyRequestsException(
          `Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ${waitPhrase(seconds)}.`,
          seconds,
        );
      }
    }
  }

  async recordFailure(email: string, client?: string): Promise<void> {
    if (!this.enabled) return;

    const now = this.clock.utcNow.getTime();
    await this.store.hit(this.clientKey(email, client), CLIENT_WINDOW_MS, now);
    await this.store.hit(this.accountKey(email), ACCOUNT_WINDOW_MS, now);
  }

  async recordSuccess(email: string, client?: string): Promise<void> {
    if (!this.enabled) return;

    await this.store.reset(this.clientKey(email, client));
    await this.store.reset(this.accountKey(email));
  }

  private clientKey(email: string, client?: string): string {
    return `login-failed:client:${email}|${client ?? '-'}`;
  }

  private accountKey(email: string): string {
    return `login-failed:account:${email}`;
  }
}
