import { Candidate } from '../../domain';
import {
  AccountRegistrationRepository,
  AccountSecurityRepository,
  UserAccountRepository,
} from '../../application/abstractions/authentication';
import { UserAccount } from '../../application/auth';
import { insertCandidate } from './postgres-candidate-repository';
import { Database, isPgError, PgErrorCode, Queryable } from './database';
import { toUserAccount, UserAccountRow } from './row-mapper';

/** Một lớp triển khai cả 3 abstraction về tài khoản (đọc, đăng ký, bảo mật). */
export class PostgresUserAccountRepository
  implements
    UserAccountRepository,
    AccountRegistrationRepository,
    AccountSecurityRepository
{
  constructor(private readonly db: Database) {}

  async findById(id: number): Promise<UserAccount | null> {
    const { rows } = await this.db.query<UserAccountRow>(
      'SELECT * FROM user_accounts WHERE id = $1',
      [id],
    );
    return rows[0] ? toUserAccount(rows[0]) : null;
  }

  async findByEmail(normalizedEmail: string): Promise<UserAccount | null> {
    const { rows } = await this.db.query<UserAccountRow>(
      'SELECT * FROM user_accounts WHERE lower(email) = lower($1)',
      [normalizedEmail],
    );
    return rows[0] ? toUserAccount(rows[0]) : null;
  }

  async getNextUserId(): Promise<number> {
    const { rows } = await this.db.query<{ id: number }>(
      "SELECT nextval('user_ids')::integer AS id",
    );
    return rows[0].id;
  }

  async emailExists(normalizedEmail: string): Promise<boolean> {
    const { rows } = await this.db.query(
      'SELECT 1 FROM user_accounts WHERE lower(email) = lower($1) LIMIT 1',
      [normalizedEmail],
    );
    return rows.length > 0;
  }

  /** Tạo tài khoản và hồ sơ ứng viên trong cùng một giao dịch. */
  async registerCandidate(
    account: UserAccount,
    candidate: Candidate,
  ): Promise<boolean> {
    try {
      await this.db.transaction(async (tx) => {
        await insertAccount(tx, account);
        await insertCandidate(tx, candidate);
      });
      return true;
    } catch (error) {
      if (isPgError(error, PgErrorCode.UniqueViolation)) return false;
      throw error;
    }
  }

  async tryUpdatePasswordHash(
    userId: number,
    expectedPasswordHash: string,
    newPasswordHash: string,
  ): Promise<boolean> {
    const { rowCount } = await this.db.query(
      'UPDATE user_accounts SET password_hash = $3 WHERE id = $1 AND password_hash = $2',
      [userId, expectedPasswordHash, newPasswordHash],
    );
    return rowCount === 1;
  }
}

export async function insertAccount(
  db: Queryable,
  account: UserAccount,
): Promise<void> {
  await db.query(
    `INSERT INTO user_accounts
       (id, name, email, password_hash, role, company_id, company_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      account.id,
      account.name,
      account.email,
      account.passwordHash,
      account.role,
      account.companyId ?? null,
      account.companyName ?? null,
    ],
  );
}
