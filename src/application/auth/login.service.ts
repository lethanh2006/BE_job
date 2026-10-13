import { Injectable } from '@nestjs/common';
import {
  AccessTokenGenerator,
  PasswordHasher,
  RefreshTokenGenerator,
  RefreshTokenRepository,
  UserAccountRepository,
} from '../abstractions/authentication';
import { InvalidCredentialsException } from '../exceptions';
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
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    if (!email?.trim() || !password?.trim()) {
      throw new InvalidCredentialsException(INVALID_MESSAGE);
    }

    const account = await this.accounts.findByEmail(email.trim().toLowerCase());
    if (
      !account ||
      !(await this.passwordHasher.verify(password, account.passwordHash))
    ) {
      throw new InvalidCredentialsException(INVALID_MESSAGE);
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
