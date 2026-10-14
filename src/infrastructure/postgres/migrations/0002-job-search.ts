import type { Migration } from './migration';

/**
 * Tìm kiếm tin tuyển dụng không phân biệt hoa thường và dấu tiếng Việt, có index.
 *
 * - `vn_fold`: lower + unaccent, khai báo IMMUTABLE để dùng được trong cột sinh và index
 *   (unaccent mặc định chỉ STABLE; từ điển cố định nên kết quả không đổi).
 * - `search_text`: tiêu đề, tên công ty và kỹ năng đã chuẩn hóa, ngăn cách bằng ký tự điều khiển
 *   để từ khóa không khớp "vắt ngang" hai trường; index trigram giúp `LIKE '%từ khóa%'` dùng index.
 * - `skills_folded`: kỹ năng đã chuẩn hóa, lọc bằng toán tử `@>` có index GIN.
 */
export const jobSearch: Migration = {
  id: '0002_job_search',
  async up(db) {
    await db.query('CREATE EXTENSION IF NOT EXISTS unaccent');
    await db.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');

    await db.query(`
      CREATE FUNCTION vn_fold(value text) RETURNS text
        LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
        AS $$ SELECT lower(unaccent('unaccent'::regdictionary, value)) $$`);
    await db.query(`
      CREATE FUNCTION vn_fold_array(items text[]) RETURNS text[]
        LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
        AS $$ SELECT coalesce(array_agg(vn_fold(item)), '{}'::text[]) FROM unnest(items) AS item $$`);
    await db.query(`
      CREATE FUNCTION job_search_text(title text, company_name text, skills text[]) RETURNS text
        LANGUAGE sql IMMUTABLE PARALLEL SAFE
        AS $$ SELECT vn_fold(title) || chr(31) || vn_fold(company_name) || chr(31)
                     || vn_fold(array_to_string(skills, chr(31))) $$`);

    await db.query(
      'ALTER TABLE jobs ADD COLUMN search_text text GENERATED ALWAYS AS (job_search_text(title, company_name, skills)) STORED',
    );
    await db.query(
      'ALTER TABLE jobs ADD COLUMN skills_folded text[] GENERATED ALWAYS AS (vn_fold_array(skills)) STORED',
    );
    await db.query(
      'CREATE INDEX ix_jobs_search_text_trgm ON jobs USING gin (search_text gin_trgm_ops)',
    );
    await db.query(
      'CREATE INDEX ix_jobs_skills_folded ON jobs USING gin (skills_folded)',
    );
  },
};
