import { RefreshTokenRepository } from '../../application/abstractions/authentication';
import { RefreshTokenSession } from '../../application/auth';
import { Database, Queryable } from './database';
import { RefreshTokenRow, toRefreshTokenSession } from './row-mapper';

export class PostgresRefreshTokenRepository extends RefreshTokenRepository {
  constructor(private readonly db: Database) {
    super();
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenSession | null> {
    const { rows } = await this.db.query<RefreshTokenRow>(
      'SELECT * FROM refresh_tokens WHERE token_hash = $1',
      [tokenHash],
    );
    return rows[0] ? toRefreshTokenSession(rows[0]) : null;
  }

  async add(session: RefreshTokenSession): Promise<void> {
    await insertSession(this.db, session);
  }

  /**
   * Thu hồi phiên hiện tại và thêm phiên thay thế trong một giao dịch.
   * `UPDATE ... WHERE revoked_at IS NULL` đảm bảo chỉ một request thắng khi dùng song song.
   */
  tryRotate(
    currentSessionId: string,
    replacementTokenHash: string,
    replacement: RefreshTokenSession,
    revokedAt: Date,
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const { rowCount } = await tx.query(
        `UPDATE refresh_tokens
            SET revoked_at = $2, replaced_by_token_hash = $3
          WHERE id = $1 AND revoked_at IS NULL`,
        [currentSessionId, revokedAt, replacementTokenHash],
      );
      if (rowCount === 0) return false;

      await insertSession(tx, replacement);
      return true;
    });
  }

  async revokeByHash(tokenHash: string, revokedAt: Date): Promise<void> {
    await this.db.query(
      'UPDATE refresh_tokens SET revoked_at = $2 WHERE token_hash = $1 AND revoked_at IS NULL',
      [tokenHash, revokedAt],
    );
  }

  async revokeFamily(familyId: string, revokedAt: Date): Promise<void> {
    await this.db.query(
      'UPDATE refresh_tokens SET revoked_at = $2 WHERE family_id = $1 AND revoked_at IS NULL',
      [familyId, revokedAt],
    );
  }

  async revokeByUser(userId: number, revokedAt: Date): Promise<void> {
    await this.db.query(
      'UPDATE refresh_tokens SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL',
      [userId, revokedAt],
    );
  }
}

async function insertSession(
  db: Queryable,
  session: RefreshTokenSession,
): Promise<void> {
  await db.query(
    `INSERT INTO refresh_tokens
       (id, user_id, family_id, token_hash, created_at, expires_at, revoked_at, replaced_by_token_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      session.id,
      session.userId,
      session.familyId,
      session.tokenHash,
      session.createdAt,
      session.expiresAt,
      session.revokedAt,
      session.replacedByTokenHash,
    ],
  );
}
