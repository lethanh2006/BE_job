import { Logger } from '@nestjs/common';
import { ArgumentError } from '../../domain';
import { Pbkdf2PasswordHasher } from '../../infrastructure/auth/pbkdf2-password-hasher';
import { SecureRefreshTokenGenerator } from '../../infrastructure/auth/secure-refresh-token-generator';
import { SecureResetTokenGenerator } from '../../infrastructure/auth/secure-reset-token-generator';
import { InMemoryCandidateRepository } from '../../infrastructure/persistence/in-memory-candidate-repository';
import { InMemoryCompanyRepository } from '../../infrastructure/persistence/in-memory-company-repository';
import { InMemoryPasswordResetRepository } from '../../infrastructure/persistence/in-memory-password-reset-repository';
import { InMemoryRefreshTokenRepository } from '../../infrastructure/persistence/in-memory-refresh-token-repository';
import { InMemoryUserAccountRepository } from '../../infrastructure/persistence/in-memory-user-account-repository';
import { JOB_SEED_FILE } from '../../infrastructure/seed/paths';
import {
  extractResetToken,
  InMemoryEmailSender,
} from '../../testing/in-memory-email-sender';
import { MutableClock } from '../../testing/test-helpers';
import { InvalidPasswordResetTokenException } from '../exceptions';
import {
  MAX_RESET_REQUESTS_PER_HOUR,
  PasswordResetService,
} from './password-reset.service';

const CANDIDATE_EMAIL = 'candidate@jobboard.vn';
const OLD_PASSWORD = 'JobBoard@123';
const NEW_PASSWORD = 'MatKhau#Moi2026';
const RESET_PAGE = 'https://app.test/dat-lai-mat-khau';

async function createSystem() {
  const clock = new MutableClock();
  const hasher = new Pbkdf2PasswordHasher();
  const accounts = await InMemoryUserAccountRepository.createWithDemoData(
    hasher,
    new InMemoryCandidateRepository(),
    new InMemoryCompanyRepository(JOB_SEED_FILE),
  );
  const resets = new InMemoryPasswordResetRepository(accounts);
  const refreshTokens = new InMemoryRefreshTokenRepository();
  const emails = new InMemoryEmailSender();
  const resetTokens = new SecureResetTokenGenerator();
  const service = new PasswordResetService(
    accounts,
    resets,
    resetTokens,
    refreshTokens,
    hasher,
    emails,
    clock,
    { resetPageUrl: RESET_PAGE, tokenLifetimeMinutes: 30 },
  );

  /** Xin liên kết và trả về token lấy từ email vừa gửi. */
  async function requestToken(email = CANDIDATE_EMAIL): Promise<string> {
    emails.clear();
    await service.requestReset(email);
    expect(emails.sent).toHaveLength(1);
    return extractResetToken(emails.sent[0]);
  }

  async function passwordMatches(email: string, password: string) {
    const account = await accounts.findByEmail(email);
    return hasher.verify(password, account!.passwordHash);
  }

  return {
    clock,
    hasher,
    accounts,
    resets,
    refreshTokens,
    emails,
    resetTokens,
    service,
    requestToken,
    passwordMatches,
  };
}

describe('PasswordResetService.requestReset', () => {
  it('gửi email có liên kết một lần tới đúng tài khoản và chỉ lưu hash của token', async () => {
    const { service, emails, resets, accounts, resetTokens, clock } =
      await createSystem();

    await service.requestReset(CANDIDATE_EMAIL);

    expect(emails.sent).toHaveLength(1);
    const [message] = emails.sent;
    expect(message.to).toBe(CANDIDATE_EMAIL);
    expect(message.subject).toBe('Đặt lại mật khẩu JobBoard');
    expect(message.text).toContain(`${RESET_PAGE}?token=`);
    expect(message.text).toContain('30 phút');
    expect(message.html).toContain(`href="${RESET_PAGE}?token=`);

    const token = extractResetToken(message);
    expect(token).toHaveLength(43);
    // Kho chỉ nhận ra token qua hash: dùng được bằng token thật, không phải bằng hash.
    const userId = (await accounts.findByEmail(CANDIDATE_EMAIL))!.id;
    expect(
      await resets.redeem(resetTokens.hash(token), 'hash-moi', clock.utcNow),
    ).toBe(userId);
  });

  it('không lộ tài khoản nào tồn tại: email lạ, sai định dạng hoặc rỗng đều im lặng', async () => {
    const { service, emails } = await createSystem();

    for (const email of [
      'nguoi.la@jobboard.vn',
      'khong-co-a-cong',
      '   ',
      '',
    ]) {
      await expect(service.requestReset(email)).resolves.toBeUndefined();
    }

    expect(emails.sent).toHaveLength(0);
  });

  it('chuẩn hóa email: không phân biệt hoa thường và khoảng trắng', async () => {
    const { service, emails } = await createSystem();

    await service.requestReset('  Candidate@JobBoard.VN ');

    expect(emails.to(CANDIDATE_EMAIL)).toHaveLength(1);
  });

  it('không gửi cho tài khoản bị khóa', async () => {
    const { service, emails, accounts } = await createSystem();
    const account = (await accounts.findByEmail(CANDIDATE_EMAIL))!;
    await accounts.setDisabled(account.id, true);

    await service.requestReset(CANDIDATE_EMAIL);

    expect(emails.sent).toHaveLength(0);
  });

  it('giới hạn số email mỗi giờ cho một tài khoản rồi cho gửi lại khi qua giờ', async () => {
    const { service, emails, clock } = await createSystem();

    for (let i = 0; i < MAX_RESET_REQUESTS_PER_HOUR + 2; i++) {
      await service.requestReset(CANDIDATE_EMAIL);
    }
    expect(emails.sent).toHaveLength(MAX_RESET_REQUESTS_PER_HOUR);

    clock.now = new Date(clock.now.getTime() + 61 * 60_000);
    await service.requestReset(CANDIDATE_EMAIL);
    expect(emails.sent).toHaveLength(MAX_RESET_REQUESTS_PER_HOUR + 1);
  });

  it('liên kết mới vô hiệu hóa liên kết cũ', async () => {
    const { service, requestToken } = await createSystem();
    const first = await requestToken();
    const second = await requestToken();

    await expect(service.resetPassword(first, NEW_PASSWORD)).rejects.toThrow(
      InvalidPasswordResetTokenException,
    );
    await expect(
      service.resetPassword(second, NEW_PASSWORD),
    ).resolves.toBeUndefined();
  });

  it('lỗi gửi email được ghi log nhưng không làm hỏng yêu cầu', async () => {
    const { service, emails } = await createSystem();
    const errorLog = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    emails.failWith = new Error('SMTP không phản hồi');

    await expect(
      service.requestReset(CANDIDATE_EMAIL),
    ).resolves.toBeUndefined();

    expect(errorLog).toHaveBeenCalledWith(
      'Không thể gửi email đặt lại mật khẩu',
      expect.stringContaining('SMTP không phản hồi'),
    );
    errorLog.mockRestore();
  });
});

describe('PasswordResetService.resetPassword', () => {
  it('đặt mật khẩu mới, đăng xuất mọi phiên, gửi email xác nhận và hủy token', async () => {
    const {
      service,
      requestToken,
      passwordMatches,
      refreshTokens,
      emails,
      clock,
      accounts,
    } = await createSystem();
    const userId = (await accounts.findByEmail(CANDIDATE_EMAIL))!.id;
    const session = new SecureRefreshTokenGenerator(
      clock,
      7 * 86_400_000,
    ).generate(userId);
    await refreshTokens.add(session.session);
    const token = await requestToken();
    emails.clear();

    await service.resetPassword(token, NEW_PASSWORD);

    expect(await passwordMatches(CANDIDATE_EMAIL, NEW_PASSWORD)).toBe(true);
    expect(await passwordMatches(CANDIDATE_EMAIL, OLD_PASSWORD)).toBe(false);
    const stored = await refreshTokens.findByHash(session.session.tokenHash);
    expect(stored!.revokedAt).not.toBeNull();
    expect(emails.sent).toHaveLength(1);
    expect(emails.sent[0].subject).toBe(
      'Mật khẩu JobBoard của bạn đã được đặt lại',
    );
    expect(emails.sent[0].text).not.toContain(token);

    await expect(service.resetPassword(token, 'KhacNua#2026x')).rejects.toThrow(
      InvalidPasswordResetTokenException,
    );
    expect(await passwordMatches(CANDIDATE_EMAIL, NEW_PASSWORD)).toBe(true);
  });

  it('mật khẩu yếu bị từ chối mà không làm mất liên kết', async () => {
    const { service, requestToken, passwordMatches } = await createSystem();
    const token = await requestToken();

    await expect(service.resetPassword(token, 'yeu')).rejects.toThrow(
      ArgumentError,
    );
    expect(await passwordMatches(CANDIDATE_EMAIL, OLD_PASSWORD)).toBe(true);

    await service.resetPassword(token, NEW_PASSWORD);
    expect(await passwordMatches(CANDIDATE_EMAIL, NEW_PASSWORD)).toBe(true);
  });

  it('token sai, rỗng hoặc hết hạn cùng trả một lỗi', async () => {
    const { service, requestToken, clock } = await createSystem();
    const token = await requestToken();

    const wrong = await service
      .resetPassword('khong-phai-token', NEW_PASSWORD)
      .catch((error: Error) => error);
    const empty = await service
      .resetPassword('   ', NEW_PASSWORD)
      .catch((error: Error) => error);
    clock.now = new Date(clock.now.getTime() + 31 * 60_000);
    const expired = await service
      .resetPassword(token, NEW_PASSWORD)
      .catch((error: Error) => error);

    for (const error of [wrong, empty, expired]) {
      expect(error).toBeInstanceOf(InvalidPasswordResetTokenException);
      expect((error as Error).message).toBe((wrong as Error).message);
    }
  });

  it('token còn dùng được đến sát hạn', async () => {
    const { service, requestToken, clock } = await createSystem();
    const token = await requestToken();

    clock.now = new Date(clock.now.getTime() + 30 * 60_000 - 1);

    await expect(
      service.resetPassword(token, NEW_PASSWORD),
    ).resolves.toBeUndefined();
  });

  it('tài khoản bị khóa sau khi xin liên kết không đặt lại được, và token không bị mất', async () => {
    const { service, requestToken, accounts, passwordMatches } =
      await createSystem();
    const token = await requestToken();
    const account = (await accounts.findByEmail(CANDIDATE_EMAIL))!;
    await accounts.setDisabled(account.id, true);

    await expect(service.resetPassword(token, NEW_PASSWORD)).rejects.toThrow(
      InvalidPasswordResetTokenException,
    );
    expect(await passwordMatches(CANDIDATE_EMAIL, OLD_PASSWORD)).toBe(true);

    await accounts.setDisabled(account.id, false);
    await service.resetPassword(token, NEW_PASSWORD);
    expect(await passwordMatches(CANDIDATE_EMAIL, NEW_PASSWORD)).toBe(true);
  });

  it('dùng song song một token: đúng một request thành công', async () => {
    const { service, requestToken } = await createSystem();
    const token = await requestToken();

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        service.resetPassword(token, NEW_PASSWORD),
      ),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      results
        .filter((r) => r.status === 'rejected')
        .every((r) => r.reason instanceof InvalidPasswordResetTokenException),
    ).toBe(true);
  });

  it('email xác nhận lỗi không làm hỏng việc đặt lại mật khẩu', async () => {
    const { service, requestToken, emails, passwordMatches } =
      await createSystem();
    const token = await requestToken();
    const errorLog = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    emails.failWith = new Error('hộp thư đầy');

    await service.resetPassword(token, NEW_PASSWORD);

    expect(await passwordMatches(CANDIDATE_EMAIL, NEW_PASSWORD)).toBe(true);
    errorLog.mockRestore();
  });
});
