import type { Migration } from './migration';

/**
 * Kiểm duyệt dành cho quản trị viên: lý do gỡ tin, lý do khóa công ty, khóa tài khoản và
 * nhật ký thao tác (ai làm gì, lúc nào) để truy vết.
 */
export const moderation: Migration = {
  id: '0004_moderation',
  async up(db) {
    await db.query('ALTER TABLE jobs ADD COLUMN removal_reason text');
    await db.query('ALTER TABLE companies ADD COLUMN suspension_reason text');
    await db.query(
      'ALTER TABLE user_accounts ADD COLUMN disabled_at timestamptz',
    );
    await db.query(`
      CREATE TABLE audit_logs (
        id bigserial PRIMARY KEY,
        actor_id integer NOT NULL,
        actor_name varchar(160) NOT NULL,
        action varchar(64) NOT NULL,
        target_type varchar(32) NOT NULL,
        target_id integer NOT NULL,
        detail text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await db.query(
      'CREATE INDEX ix_audit_logs_created_at ON audit_logs (created_at DESC, id DESC)',
    );
  },
};
