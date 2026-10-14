import type { Migration } from './migration';

/**
 * Tách công ty thành bảng riêng. Trước đây tên công ty chỉ nằm rải rác ở `jobs` và
 * `user_accounts`; migration này gom lại, giữ nguyên mã công ty hiện có và thêm khóa ngoại.
 *
 * - Dữ liệu cũ được chuyển sang (ưu tiên thông tin ở `jobs`, rồi `user_accounts`).
 * - Tên trùng (không phân biệt hoa thường) giữa hai mã khác nhau được thêm hậu tố ` (#mã)` để
 *   tạo được index unique.
 * - `jobs.company_name/company_location` vẫn giữ làm bản chụp phục vụ tìm kiếm có index; còn
 *   `user_accounts.company_name` bị bỏ (đọc qua JOIN) để tên công ty chỉ có một nguồn.
 */
export const companies: Migration = {
  id: '0003_companies',
  async up(db) {
    await db.query('CREATE SEQUENCE company_ids START WITH 100');
    await db.query(`
      CREATE TABLE companies (
        id integer PRIMARY KEY,
        name varchar(200) NOT NULL,
        location varchar(200),
        website varchar(300),
        description text,
        status varchar(32) NOT NULL DEFAULT 'Active',
        created_at timestamptz NOT NULL DEFAULT now()
      )`);

    await db.query(`
      INSERT INTO companies (id, name, location)
      SELECT DISTINCT ON (company_id) company_id, company_name, company_location
        FROM jobs ORDER BY company_id, id`);
    await db.query(`
      INSERT INTO companies (id, name)
      SELECT DISTINCT ON (company_id) company_id, company_name
        FROM user_accounts
       WHERE company_id IS NOT NULL
         AND company_name IS NOT NULL
         AND company_id NOT IN (SELECT id FROM companies)
       ORDER BY company_id, id`);
    // Tài khoản trỏ tới công ty chưa có dòng nào ở bảng trên: tạo tạm để khóa ngoại không vỡ.
    await db.query(`
      INSERT INTO companies (id, name)
      SELECT DISTINCT company_id, 'Công ty #' || company_id
        FROM user_accounts
       WHERE company_id IS NOT NULL AND company_id NOT IN (SELECT id FROM companies)`);

    await db.query(`
      UPDATE companies AS c
         SET name = c.name || ' (#' || c.id || ')'
       WHERE EXISTS (
         SELECT 1 FROM companies o WHERE lower(o.name) = lower(c.name) AND o.id < c.id)`);
    await db.query(`
      UPDATE jobs AS j SET company_name = c.name
        FROM companies c WHERE c.id = j.company_id AND j.company_name <> c.name`);

    await db.query(`
      SELECT setval('company_ids',
                    GREATEST(100, COALESCE((SELECT max(id) FROM companies), 0) + 1),
                    false)`);

    await db.query(
      'CREATE UNIQUE INDEX ux_companies_name ON companies (lower(name))',
    );
    await db.query(`
      ALTER TABLE jobs
        ADD CONSTRAINT fk_jobs_company FOREIGN KEY (company_id)
        REFERENCES companies (id) ON DELETE RESTRICT`);
    await db.query(`
      ALTER TABLE user_accounts
        ADD CONSTRAINT fk_user_accounts_company FOREIGN KEY (company_id)
        REFERENCES companies (id) ON DELETE RESTRICT`);
    await db.query('ALTER TABLE user_accounts DROP COLUMN company_name');
    // Chỉ nhà tuyển dụng thuộc về một công ty.
    await db.query(`
      ALTER TABLE user_accounts
        ADD CONSTRAINT ck_user_accounts_employer_company
        CHECK ((role = 'Employer') = (company_id IS NOT NULL))`);
  },
};
