import { Database } from './database';
import { initialSchema } from './migrations/0001-initial-schema';
import { jobSearch } from './migrations/0002-job-search';
import { companies } from './migrations/0003-companies';
import { moderation } from './migrations/0004-moderation';
import { notifications } from './migrations/0005-notifications';
import { savedJobs } from './migrations/0006-saved-jobs';
import { candidateFiles } from './migrations/0007-candidate-files';
import { passwordResets } from './migrations/0008-password-resets';
import type { Migration } from './migrations/migration';

/** Danh sách migration theo thứ tự; chỉ thêm vào cuối, không sửa migration đã phát hành. */
export const allMigrations: readonly Migration[] = [
  initialSchema,
  jobSearch,
  companies,
  moderation,
  notifications,
  savedJobs,
  candidateFiles,
  passwordResets,
];

/** Khóa advisory để nhiều instance khởi động cùng lúc không áp migration song song. */
const MIGRATION_LOCK_KEY = 7_426_001;

/**
 * Áp các migration chưa chạy trong MỘT giao dịch (DDL của PostgreSQL có tính giao dịch,
 * nên lỗi giữa chừng sẽ rollback toàn bộ). Trả về mã các migration vừa áp.
 */
export async function runMigrations(
  db: Database,
  migrations: readonly Migration[] = allMigrations,
): Promise<string[]> {
  return db.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK_KEY]);
    await tx.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);

    const applied = new Set(
      (
        await tx.query<{ id: string }>('SELECT id FROM schema_migrations')
      ).rows.map((row) => row.id),
    );
    const executed: string[] = [];
    for (const migration of migrations) {
      if (applied.has(migration.id)) continue;
      await migration.up(tx);
      await tx.query('INSERT INTO schema_migrations (id) VALUES ($1)', [
        migration.id,
      ]);
      executed.push(migration.id);
    }

    return executed;
  });
}
