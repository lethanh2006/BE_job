import { Injectable } from '@nestjs/common';
import { ArgumentError, Candidate } from '../../domain';
import {
  AccessTokenGenerator,
  AccountRegistrationRepository,
  PasswordHasher,
  RefreshTokenGenerator,
  RefreshTokenRepository,
} from '../abstractions/authentication';
import { EmailAlreadyExistsException } from '../exceptions';
import {
  AccountRole,
  LoginResult,
  toAuthenticatedUser,
  UserAccount,
} from './models';
import { validatePassword } from './password-policy';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class RegistrationService {
  constructor(
    private readonly registrations: AccountRegistrationRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly accessTokens: AccessTokenGenerator,
    private readonly refreshTokenGenerator: RefreshTokenGenerator,
    private readonly refreshTokens: RefreshTokenRepository,
  ) {}

  async registerCandidate(
    name: string,
    email: string,
    password: string,
  ): Promise<LoginResult> {
    validatePassword(password);

    const normalizedName = name?.trim() ?? '';
    if (!normalizedName) {
      throw new ArgumentError('Tên người dùng không được để trống.');
    }
    const normalizedEmail = email?.trim().toLowerCase() ?? '';
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      throw new ArgumentError('Email không hợp lệ.');
    }

    if (await this.registrations.emailExists(normalizedEmail)) {
      throw new EmailAlreadyExistsException('Email này đã được sử dụng.');
    }

    const userId = await this.registrations.getNextUserId();
    const account: UserAccount = {
      id: userId,
      name: normalizedName,
      email: normalizedEmail,
      passwordHash: await this.passwordHasher.hash(password),
      role: AccountRole.Candidate,
    };
    const candidate = new Candidate(userId, normalizedName, normalizedEmail);

    if (!(await this.registrations.registerCandidate(account, candidate))) {
      throw new EmailAlreadyExistsException('Email này đã được sử dụng.');
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
