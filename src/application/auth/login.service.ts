import { Injectable } from '@nestjs/common';
import {
  AccessTokenGenerator,
  PasswordHasher,
  RefreshTokenGenerator,
  RefreshTokenRepository,
  UserAccountRepository,
} from '../abstractions/authentication';
import {
  AccountDisabledException,
  InvalidCredentialsException,
} from '../exceptions';
import { LoginAttemptLimiter } from './login-attempt-limiter';
import { LoginResult, toAuthenticatedUser } from './models';

const INVALID_MESSAGE = 'Email hoặc mật khẩu không chính xác.';

@Injectable()
export class LoginService {
  constructor(
    private readonly accounts: UserAccountRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly accessTokens: AccessTokenGenerator,
    private readonly refreshTokenGenerator: RefreshTokenGenerator,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly limiter: LoginAttemptLimiter,
  ) {}

  /** `client` là định danh nơi gửi yêu cầu (IP đã chuẩn hóa) để giới hạn số lần đăng nhập sai. */
  async login(
    email: string,
    password: string,
    client?: string,
  ): Promise<LoginResult> {
    if (!email?.trim() || !password?.trim()) {
      throw new InvalidCredentialsException(INVALID_MESSAGE);
    }

    const normalizedEmail = email.trim().toLowerCase();
    await this.limiter.assertAllowed(normalizedEmail, client);

    const account = await this.accounts.findByEmail(normalizedEmail);
    if (
      !account ||
      !(await this.passwordHasher.verify(password, account.passwordHash))
    ) {
      await this.limiter.recordFailure(normalizedEmail, client);
      throw new InvalidCredentialsException(INVALID_MESSAGE);
    }
    await this.limiter.recordSuccess(normalizedEmail, client);

    // Chỉ báo "bị khóa" sau khi mật khẩu đúng để không lộ tài khoản nào tồn tại.
    if (account.disabled) {
      throw new AccountDisabledException(
        'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.',
      );
    }

    const accessToken = await this.accessTokens.generate(account);
    const refreshToken = this.refreshTokenGenerator.generate(account.id);
    await this.refreshTokens.add(refreshToken.session);

    return {
      accessToken: accessToken.value,
      expiresAt: accessToken.expiresAt,
      refreshToken: refreshToken.value,
      refreshExpiresAt: refreshToken.session.expiresAt,
      user: toAuthenticatedUser(account),
    };
  }
}
