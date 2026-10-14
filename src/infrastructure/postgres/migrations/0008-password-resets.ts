import type { Migration } from './migration';

export const passwordResets: Migration = {
  id: '0008_password_resets',
  async up(db) {
    await db.query(`CREATE TABLE password_reset_tokens (
      id uuid PRIMARY KEY,
      user_id integer NOT NULL REFERENCES user_accounts (id) ON DELETE CASCADE,
      token_hash char(64) NOT NULL,
      created_at timestamptz NOT NULL,
      expires_at timestamptz NOT NULL,
      used_at timestamptz
    )`);
    await db.query(
      'CREATE UNIQUE INDEX ux_password_reset_tokens_token_hash ON password_reset_tokens (token_hash)',
    );
    await db.query(
      'CREATE INDEX ix_password_reset_tokens_user_created ON password_reset_tokens (user_id, created_at DESC)',
    );
    await db.query(
      'CREATE INDEX ix_password_reset_tokens_expires ON password_reset_tokens (expires_at)',
    );
  },
};
