export interface RateLimitCounter {
  count: number;
  /** Thời điểm cửa sổ hiện tại kết thúc (epoch ms). */
  resetAt: number;
}

/**
 * Bộ đếm theo khóa trong cửa sổ cố định. Bản in-memory đủ cho một instance; chạy nhiều instance
 * cần cài đặt khác dùng kho chung (Redis, cơ sở dữ liệu) mà không phải sửa nơi dùng.
 */
export abstract class RateLimitStore {
  /** Cộng một lượt cho `key`; mở cửa sổ mới `windowMs` nếu chưa có hoặc cửa sổ cũ đã hết. */
  abstract hit(
    key: string,
    windowMs: number,
    now: number,
  ): Promise<RateLimitCounter>;
  /** Xem bộ đếm hiện tại mà không cộng thêm; null nếu chưa có hoặc đã hết hạn. */
  abstract peek(key: string, now: number): Promise<RateLimitCounter | null>;
  abstract reset(key: string): Promise<void>;
}

export const secondsUntil = (resetAt: number, now: number): number =>
  Math.max(1, Math.ceil((resetAt - now) / 1000));

/** "45 giây", "3 phút" — làm tròn lên để người dùng không thử lại quá sớm. */
export const waitPhrase = (seconds: number): string =>
  seconds < 60 ? `${seconds} giây` : `${Math.ceil(seconds / 60)} phút`;
