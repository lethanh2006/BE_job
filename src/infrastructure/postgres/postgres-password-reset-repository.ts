import { PasswordResetRepository } from '../../application/abstractions/authentication';
import {
  PasswordResetToken,
  RESET_TOKEN_RETENTION_MS,
} from '../../application/auth';
import { Database } from './database';

export class PostgresPasswordResetRepository extends PasswordResetRepository {
  constructor(private readonly db: Database) {
    super();
  }

  issue(token: PasswordResetToken): Promise<void> {
    return this.db.transaction(async (tx) => {
      // Mỗi tài khoản chỉ có một liên kết còn hiệu lực: token cũ bị vô hiệu hóa.
      await tx.query(
        'UPDATE password_reset_tokens SET used_at = $2 WHERE user_id = $1 AND used_at IS NULL',
        [token.userId, token.createdAt],
      );
      await tx.query(
        'DELETE FROM password_reset_tokens WHERE expires_at < $1',
        [new Date(token.createdAt.getTime() - RESET_TOKEN_RETENTION_MS)],
      );
      await tx.query(
        `INSERT INTO password_reset_tokens (id, user_id, token_hash, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          token.id,
          token.userId,
          token.tokenHash,
          token.createdAt,
          token.expiresAt,
        ],
      );
    });
  }

  async countIssuedSince(userId: number, since: Date): Promise<number> {
    const { rows } = await this.db.query<{ count: number }>(
      `SELECT count(*)::integer AS count FROM password_reset_tokens
        WHERE user_id = $1 AND created_at >= $2`,
      [userId, since],
    );
    return rows[0].count;
  }

  /**
   * `UPDATE ... WHERE used_at IS NULL` khóa dòng token: hai request song song với cùng một token
   * thì request sau chờ rồi thấy token đã dùng, nên chỉ một request đặt được mật khẩu.
   */
  redeem(
    tokenHash: string,
    newPasswordHash: string,
    now: Date,
  ): Promise<number | null> {
    return this.db.transaction(async (tx) => {
      const { rows } = await tx.query<{ user_id: number }>(
        `UPDATE password_reset_tokens t SET used_at = $2
          WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > $2
            AND EXISTS (SELECT 1 FROM user_accounts a
                         WHERE a.id = t.user_id AND a.disabled_at IS NULL)
          RETURNING t.user_id`,
        [tokenHash, now],
      );
      if (rows.length === 0) return null;

      const userId = rows[0].user_id;
      await tx.query(
        'UPDATE user_accounts SET password_hash = $2 WHERE id = $1',
        [userId, newPasswordHash],
      );
      await tx.query(
        'UPDATE password_reset_tokens SET used_at = $2 WHERE user_id = $1 AND used_at IS NULL',
        [userId, now],
      );
      return userId;
    });
  }
}
