import { Injectable } from '@nestjs/common';
import { ArgumentError, Candidate, Company } from '../../domain';
import {
  AccessTokenGenerator,
  AccountRegistrationRepository,
  EmployerRegistrationRepository,
  PasswordHasher,
  RefreshTokenGenerator,
  RefreshTokenRepository,
} from '../abstractions/authentication';
import { CompanyRepository } from '../abstractions/persistence';
import {
  CompanyNameAlreadyExistsException,
  EmailAlreadyExistsException,
} from '../exceptions';
import {
  AccountRole,
  LoginResult,
  toAuthenticatedUser,
  UserAccount,
} from './models';
import { validatePassword } from './password-policy';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_TAKEN = 'Email này đã được sử dụng.';

export interface RegisterEmployerCommand {
  name: string;
  email: string;
  password: string;
  companyName: string;
  companyLocation?: string | null;
}

@Injectable()
export class RegistrationService {
  constructor(
    private readonly registrations: AccountRegistrationRepository,
    private readonly employerRegistrations: EmployerRegistrationRepository,
    private readonly companies: CompanyRepository,
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
    const normalizedName = normalizeName(name);
    const normalizedEmail = normalizeEmail(email);

    if (await this.registrations.emailExists(normalizedEmail)) {
      throw new EmailAlreadyExistsException(EMAIL_TAKEN);
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
      throw new EmailAlreadyExistsException(EMAIL_TAKEN);
    }

    return this.startSession(account);
  }

  /** Đăng ký nhà tuyển dụng: tạo công ty mới và tài khoản quản lý công ty đó. */
  async registerEmployer(
    command: RegisterEmployerCommand,
  ): Promise<LoginResult> {
    validatePassword(command.password);
    const name = normalizeName(command.name);
    const email = normalizeEmail(command.email);
    // Company kiểm tra tên/địa điểm hợp lệ (ArgumentError) trước khi tốn mã định danh.
    const company = new Company(
      await this.companies.getNextId(),
      command.companyName,
      command.companyLocation,
    );

    if (await this.registrations.emailExists(email)) {
      throw new EmailAlreadyExistsException(EMAIL_TAKEN);
    }

    const account: UserAccount = {
      id: await this.registrations.getNextUserId(),
      name,
      email,
      passwordHash: await this.passwordHasher.hash(command.password),
      role: AccountRole.Employer,
      companyId: company.id,
      companyName: company.name,
    };

    const outcome = await this.employerRegistrations.registerEmployer(
      account,
      company,
    );
    if (outcome === 'EmailTaken') {
      throw new EmailAlreadyExistsException(EMAIL_TAKEN);
    }
    if (outcome === 'CompanyNameTaken') {
      throw new CompanyNameAlreadyExistsException(
        'Tên công ty đã được đăng ký.',
      );
    }

    return this.startSession(account);
  }

  private async startSession(account: UserAccount): Promise<LoginResult> {
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

function normalizeName(name: string): string {
  const normalized = name?.trim() ?? '';
  if (!normalized) {
    throw new ArgumentError('Tên người dùng không được để trống.');
  }
  if (normalized.length > 160) {
    throw new ArgumentError('Tên người dùng không được dài quá 160 ký tự.');
  }

  return normalized;
}

function normalizeEmail(email: string): string {
  const normalized = email?.trim().toLowerCase() ?? '';
  if (!EMAIL_PATTERN.test(normalized) || normalized.length > 320) {
    throw new ArgumentError('Email không hợp lệ.');
  }

  return normalized;
}
