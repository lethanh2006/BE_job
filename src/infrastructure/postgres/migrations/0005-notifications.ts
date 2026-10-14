import type { Migration } from './migration';

/**
 * Thông báo trong ứng dụng, và cột kỹ năng đã chuẩn hóa của ứng viên (có index GIN) để tìm nhanh
 * nhóm ứng viên phù hợp khi có tin mới.
 */
export const notifications: Migration = {
  id: '0005_notifications',
  async up(db) {
    await db.query(`
      CREATE TABLE notifications (
        id bigserial PRIMARY KEY,
        user_id integer NOT NULL REFERENCES user_accounts (id) ON DELETE CASCADE,
        type varchar(48) NOT NULL,
        title varchar(200) NOT NULL,
        body text NOT NULL,
        link varchar(300),
        created_at timestamptz NOT NULL,
        read_at timestamptz
      )`);
    await db.query(
      'CREATE INDEX ix_notifications_user_created ON notifications (user_id, created_at DESC, id DESC)',
    );
    // Đếm "chưa đọc" chạy ở mọi lần tải trang nên cần index riêng chỉ cho dòng chưa đọc.
    await db.query(
      'CREATE INDEX ix_notifications_user_unread ON notifications (user_id) WHERE read_at IS NULL',
    );

    await db.query(
      'ALTER TABLE candidates ADD COLUMN skills_folded text[] GENERATED ALWAYS AS (vn_fold_array(skills)) STORED',
    );
    await db.query(
      'CREATE INDEX ix_candidates_skills_folded ON candidates USING gin (skills_folded)',
    );
  },
};
