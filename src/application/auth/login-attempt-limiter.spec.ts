import { InMemoryRateLimitStore } from '../../infrastructure/rate-limiting/in-memory-rate-limit-store';
import { MutableClock } from '../../testing/test-helpers';
import { TooManyRequestsException } from '../exceptions';
import {
  ACCOUNT_WINDOW_MS,
  CLIENT_WINDOW_MS,
  LoginAttemptLimiter,
  MAX_FAILURES_PER_ACCOUNT,
  MAX_FAILURES_PER_CLIENT,
} from './login-attempt-limiter';

const EMAIL = 'an@example.com';

function createLimiter(enabled = true) {
  const clock = new MutableClock();
  return {
    clock,
    limiter: new LoginAttemptLimiter(
      new InMemoryRateLimitStore(),
      clock,
      enabled,
    ),
  };
}

async function fail(
  limiter: LoginAttemptLimiter,
  times: number,
  client = 'ip1',
  email = EMAIL,
) {
  for (let i = 0; i < times; i++) {
    await limiter.assertAllowed(email, client);
    await limiter.recordFailure(email, client);
  }
}

describe('LoginAttemptLimiter', () => {
  it('cho phép đến ngưỡng rồi khóa cặp (email, IP) kèm thời gian chờ', async () => {
    const { limiter } = createLimiter();

    await fail(limiter, MAX_FAILURES_PER_CLIENT);

    const error = await limiter
      .assertAllowed(EMAIL, 'ip1')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TooManyRequestsException);
    expect((error as TooManyRequestsException).retryAfterSeconds).toBe(
      CLIENT_WINDOW_MS / 1000,
    );
    expect((error as Error).message).toBe(
      'Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.',
    );
  });

  it('khóa một cặp không ảnh hưởng IP khác hay email khác', async () => {
    const { limiter } = createLimiter();
    await fail(limiter, MAX_FAILURES_PER_CLIENT);

    await expect(limiter.assertAllowed(EMAIL, 'ip2')).resolves.toBeUndefined();
    await expect(
      limiter.assertAllowed('khac@example.com', 'ip1'),
    ).resolves.toBeUndefined();
  });

  it('hết cửa sổ thì mở lại', async () => {
    const { limiter, clock } = createLimiter();
    await fail(limiter, MAX_FAILURES_PER_CLIENT);

    clock.now = new Date(clock.now.getTime() + CLIENT_WINDOW_MS);

    await expect(limiter.assertAllowed(EMAIL, 'ip1')).resolves.toBeUndefined();
  });

  it('đăng nhập đúng xóa bộ đếm', async () => {
    const { limiter } = createLimiter();
    await fail(limiter, MAX_FAILURES_PER_CLIENT - 1);

    await limiter.recordSuccess(EMAIL, 'ip1');
    await fail(limiter, MAX_FAILURES_PER_CLIENT - 1);

    await expect(limiter.assertAllowed(EMAIL, 'ip1')).resolves.toBeUndefined();
  });

  it('đoán phân tán từ nhiều IP bị chặn theo tài khoản ở ngưỡng cao hơn', async () => {
    const { limiter } = createLimiter();

    for (let i = 0; i < MAX_FAILURES_PER_ACCOUNT; i++) {
      await fail(limiter, 1, `ip-${i}`);
    }

    const error = await limiter
      .assertAllowed(EMAIL, 'ip-moi')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TooManyRequestsException);
    expect((error as TooManyRequestsException).retryAfterSeconds).toBe(
      ACCOUNT_WINDOW_MS / 1000,
    );
    await expect(
      limiter.assertAllowed('khac@example.com', 'ip-moi'),
    ).resolves.toBeUndefined();
  });

  it('email không tồn tại cũng bị đếm như email thật để không lộ tài khoản', async () => {
    const { limiter } = createLimiter();

    await fail(limiter, MAX_FAILURES_PER_CLIENT, 'ip1', 'khong.co@example.com');

    await expect(
      limiter.assertAllowed('khong.co@example.com', 'ip1'),
    ).rejects.toBeInstanceOf(TooManyRequestsException);
  });

  it('khi tắt thì không đếm và không chặn', async () => {
    const { limiter } = createLimiter(false);

    await fail(limiter, MAX_FAILURES_PER_CLIENT * 3);

    await expect(limiter.assertAllowed(EMAIL, 'ip1')).resolves.toBeUndefined();
  });
});
