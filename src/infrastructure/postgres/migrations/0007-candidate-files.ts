import type { Migration } from './migration';

/**
 * CV của ứng viên. Nội dung tệp nằm ở kho tệp (không phải trong database); bảng này giữ thông tin
 * mô tả và đánh dấu CV hiện tại. Đơn ứng tuyển tham chiếu tệp đã đính kèm lúc nộp.
 */
export const candidateFiles: Migration = {
  id: '0007_candidate_files',
  async up(db) {
    await db.query(`
      CREATE TABLE candidate_files (
        id uuid PRIMARY KEY,
        candidate_id integer NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
        file_name varchar(200) NOT NULL,
        content_type varchar(120) NOT NULL,
        size_bytes integer NOT NULL,
        storage_key uuid NOT NULL,
        is_current boolean NOT NULL DEFAULT false,
        uploaded_at timestamptz NOT NULL
      )`);
    // Mỗi ứng viên có tối đa một CV hiện tại; ràng buộc nằm ở database để hai lần tải song song không vượt được.
    await db.query(
      'CREATE UNIQUE INDEX ux_candidate_files_current ON candidate_files (candidate_id) WHERE is_current',
    );
    await db.query(
      'ALTER TABLE job_applications ADD COLUMN cv_file_id uuid REFERENCES candidate_files (id) ON DELETE SET NULL',
    );
    await db.query(
      'CREATE INDEX ix_job_applications_cv_file_id ON job_applications (cv_file_id) WHERE cv_file_id IS NOT NULL',
    );
  },
};
