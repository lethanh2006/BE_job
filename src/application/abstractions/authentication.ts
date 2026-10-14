import { Candidate, Company } from '../../domain';
import {
  AccessToken,
  IssuedRefreshToken,
  RefreshTokenSession,
  UserAccount,
} from '../auth';

export abstract class UserAccountRepository {
  abstract findById(id: number): Promise<UserAccount | null>;
  abstract findByEmail(normalizedEmail: string): Promise<UserAccount | null>;
  /** Mã các tài khoản nhà tuyển dụng đang hoạt động của một công ty. */
  abstract findEmployerIds(companyId: number): Promise<number[]>;
}

export abstract class AccountRegistrationRepository {
  abstract getNextUserId(): Promise<number>;
  abstract emailExists(normalizedEmail: string): Promise<boolean>;
  /** Trả về false khi email đã tồn tại (race condition). */
  abstract registerCandidate(
    account: UserAccount,
    candidate: Candidate,
  ): Promise<boolean>;
}

export type EmployerRegistrationOutcome =
  'Created' | 'EmailTaken' | 'CompanyNameTaken';

export abstract class EmployerRegistrationRepository {
  /** Tạo công ty và tài khoản nhà tuyển dụng trong cùng một giao dịch. */
  abstract registerEmployer(
    account: UserAccount,
    company: Company,
  ): Promise<EmployerRegistrationOutcome>;
}

export abstract class AccountSecurityRepository {
  /** Cập nhật hash có điều kiện (optimistic); false nếu hash hiện tại đã đổi. */
  abstract tryUpdatePasswordHash(
    userId: number,
    expectedPasswordHash: string,
    newPasswordHash: string,
  ): Promise<boolean>;
  /** Khóa/mở khóa tài khoản; false nếu tài khoản không tồn tại. */
  abstract setDisabled(userId: number, disabled: boolean): Promise<boolean>;
}

export abstract class PasswordHasher {
  abstract hash(password: string): Promise<string>;
  abstract verify(password: string, passwordHash: string): Promise<boolean>;
}

export abstract class AccessTokenGenerator {
  abstract generate(account: UserAccount): Promise<AccessToken>;
}

export abstract class RefreshTokenGenerator {
  abstract generate(userId: number, familyId?: string): IssuedRefreshToken;
  abstract hash(token: string): string;
}

export abstract class RefreshTokenRepository {
  abstract findByHash(tokenHash: string): Promise<RefreshTokenSession | null>;
  abstract add(session: RefreshTokenSession): Promise<void>;
  abstract tryRotate(
    currentSessionId: string,
    replacementTokenHash: string,
    replacement: RefreshTokenSession,
    revokedAt: Date,
  ): Promise<boolean>;
  abstract revokeByHash(tokenHash: string, revokedAt: Date): Promise<void>;
  abstract revokeFamily(familyId: string, revokedAt: Date): Promise<void>;
  abstract revokeByUser(userId: number, revokedAt: Date): Promise<void>;
}
