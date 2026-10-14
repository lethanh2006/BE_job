import { PasswordResetRepository } from '../../application/abstractions/authentication';
import {
  PasswordResetToken,
  RESET_TOKEN_RETENTION_MS,
} from '../../application/auth';
import { InMemoryUserAccountRepository } from './in-memory-user-account-repository';

interface StoredToken extends PasswordResetToken {
  /** Đã dùng hoặc bị vô hiệu hóa (có token mới hơn / đã đặt lại mật khẩu thành công). */
  usedAt: Date | null;
}

export class InMemoryPasswordResetRepository extends PasswordResetRepository {
  private tokens: StoredToken[] = [];

  constructor(private readonly accounts: InMemoryUserAccountRepository) {
    super();
  }

  issue(token: PasswordResetToken): Promise<void> {
    for (const stored of this.tokens) {
      if (stored.userId === token.userId && stored.usedAt === null) {
        stored.usedAt = token.createdAt;
      }
    }

    const cutoff = token.createdAt.getTime() - RESET_TOKEN_RETENTION_MS;
    this.tokens = this.tokens.filter(
      (stored) => stored.expiresAt.getTime() >= cutoff,
    );
    this.tokens.push({ ...token, usedAt: null });
    return Promise.resolve();
  }

  countIssuedSince(userId: number, since: Date): Promise<number> {
    return Promise.resolve(
      this.tokens.filter(
        (stored) =>
          stored.userId === userId &&
          stored.createdAt.getTime() >= since.getTime(),
      ).length,
    );
  }

  /** Kiểm tra và dùng token không xen await nên hai lần dùng song song chỉ một lần thành công. */
  redeem(
    tokenHash: string,
    newPasswordHash: string,
    now: Date,
  ): Promise<number | null> {
    const token = this.tokens.find((stored) => stored.tokenHash === tokenHash);
    if (
      !token ||
      token.usedAt !== null ||
      token.expiresAt.getTime() <= now.getTime() ||
      !this.accounts.resetPassword(token.userId, newPasswordHash)
    ) {
      return Promise.resolve(null);
    }

    for (const stored of this.tokens) {
      if (stored.userId === token.userId && stored.usedAt === null) {
        stored.usedAt = now;
      }
    }
    return Promise.resolve(token.userId);
  }
}
