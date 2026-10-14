import { Injectable } from '@nestjs/common';
import { Clock } from '../../domain';
import {
  AccessTokenGenerator,
  RefreshTokenGenerator,
  RefreshTokenRepository,
  UserAccountRepository,
} from '../abstractions/authentication';
import { InvalidRefreshTokenException } from '../exceptions';
import { LoginResult, toAuthenticatedUser } from './models';

const INVALID_TOKEN_MESSAGE = 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.';

@Injectable()
export class SessionService {
  constructor(
    private readonly accounts: UserAccountRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly refreshTokenGenerator: RefreshTokenGenerator,
    private readonly accessTokens: AccessTokenGenerator,
    private readonly clock: Clock,
  ) {}

  async refresh(refreshToken: string): Promise<LoginResult> {
    if (!refreshToken?.trim()) {
      throw new InvalidRefreshTokenException(INVALID_TOKEN_MESSAGE);
    }

    const tokenHash = this.refreshTokenGenerator.hash(refreshToken);
    const current = await this.refreshTokens.findByHash(tokenHash);
    if (!current) throw new InvalidRefreshTokenException(INVALID_TOKEN_MESSAGE);

    const now = this.clock.utcNow;

    // Token đã bị thu hồi mà vẫn được dùng lại → nghi ngờ bị đánh cắp, thu hồi cả họ token.
    if (current.revokedAt !== null) {
      await this.refreshTokens.revokeFamily(current.familyId, now);
      throw new InvalidRefreshTokenException(INVALID_TOKEN_MESSAGE);
    }

    if (!current.isActiveAt(now)) {
      await this.refreshTokens.revokeByHash(tokenHash, now);
      throw new InvalidRefreshTokenException(INVALID_TOKEN_MESSAGE);
    }

    const account = await this.accounts.findById(current.userId);
    if (!account || account.disabled) {
      throw new InvalidRefreshTokenException(INVALID_TOKEN_MESSAGE);
    }

    const replacement = this.refreshTokenGenerator.generate(
      account.id,
      current.familyId,
    );
    const rotated = await this.refreshTokens.tryRotate(
      current.id,
      replacement.session.tokenHash,
      replacement.session,
      now,
    );
    if (!rotated) {
      await this.refreshTokens.revokeFamily(current.familyId, now);
      throw new InvalidRefreshTokenException(INVALID_TOKEN_MESSAGE);
    }

    const accessToken = await this.accessTokens.generate(account);
    return {
      accessToken: accessToken.value,
      expiresAt: accessToken.expiresAt,
      refreshToken: replacement.value,
      refreshExpiresAt: replacement.session.expiresAt,
      user: toAuthenticatedUser(account),
    };
  }

  async logout(refreshToken: string): Promise<void> {
    if (!refreshToken?.trim()) return;

    await this.refreshTokens.revokeByHash(
      this.refreshTokenGenerator.hash(refreshToken),
      this.clock.utcNow,
    );
  }
}
