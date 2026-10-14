import { Candidate, Company } from '../../domain';
import {
  AccessToken,
  IssuedRefreshToken,
  PasswordResetToken,
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

export abstract class ResetTokenGenerator {
  /** Token ngẫu nhiên đủ mạnh để không đoán được, kèm hash để lưu trữ. */
  abstract generate(): { value: string; hash: string };
  abstract hash(token: string): string;
}

export abstract class PasswordResetRepository {
  /** Lưu token mới và vô hiệu hóa mọi token còn hiệu lực trước đó của cùng tài khoản. */
  abstract issue(token: PasswordResetToken): Promise<void>;
  /** Số token đã cấp cho tài khoản từ mốc `since` (kể cả đã dùng/hết hạn), để giới hạn tần suất. */
  abstract countIssuedSince(userId: number, since: Date): Promise<number>;
  /**
   * Dùng token một lần. Chỉ khi token còn hiệu lực và tài khoản chưa bị khóa thì đặt mật khẩu mới,
   * đánh dấu token đã dùng và vô hiệu các token khác của tài khoản trong cùng một thao tác; hai
   * request song song với cùng một token chỉ một request thành công.
   * Trả về mã tài khoản, hoặc null nếu token không tồn tại/đã dùng/hết hạn/tài khoản bị khóa.
   */
  abstract redeem(
    tokenHash: string,
    newPasswordHash: string,
    now: Date,
  ): Promise<number | null>;
}
