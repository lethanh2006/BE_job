import type { Migration } from './migration';

/**
 * Lược đồ ban đầu — tương đương 3 migration EF Core của backend C#
 * (InitialPostgreSql, AddRefreshTokens, AddCandidateRegistration).
 */
export const initialSchema: Migration = {
  id: '0001_initial_schema',
  async up(db) {
    // Sequence cấp mã ở phía server, bắt đầu sau dữ liệu seed.
    await db.query('CREATE SEQUENCE job_ids START WITH 7');
    await db.query('CREATE SEQUENCE application_ids START WITH 4');
    await db.query('CREATE SEQUENCE user_ids START WITH 101');

    await db.query(`
      CREATE TABLE jobs (
        id integer PRIMARY KEY,
        title varchar(200) NOT NULL,
        company_id integer NOT NULL,
        company_name varchar(200) NOT NULL,
        company_location varchar(200),
        salary_min numeric(12,2) NOT NULL,
        salary_max numeric(12,2) NOT NULL,
        deadline timestamptz NOT NULL,
        location varchar(200) NOT NULL,
        level varchar(32) NOT NULL,
        work_mode varchar(32) NOT NULL,
        category varchar(120) NOT NULL,
        summary text NOT NULL,
        description text[] NOT NULL,
        requirements text[] NOT NULL,
        benefits text[] NOT NULL,
        posted_at timestamptz NOT NULL,
        featured boolean NOT NULL,
        status varchar(32) NOT NULL,
        skills text[] NOT NULL,
        CONSTRAINT ck_jobs_salary CHECK (salary_min >= 0 AND salary_min <= salary_max)
      )`);
    // Truy vấn danh sách đang tuyển lọc theo (status, deadline).
    await db.query(
      'CREATE INDEX ix_jobs_status_deadline ON jobs (status, deadline)',
    );
    await db.query('CREATE INDEX ix_jobs_company_id ON jobs (company_id)');

    await db.query(`
      CREATE TABLE candidates (
        id integer PRIMARY KEY,
        name varchar(160) NOT NULL,
        email varchar(320) NOT NULL,
        bio text,
        desired_salary_min numeric(12,2),
        desired_salary_max numeric(12,2),
        skills text[] NOT NULL
      )`);
    await db.query(
      'CREATE UNIQUE INDEX ux_candidates_email ON candidates (lower(email))',
    );

    await db.query(`
      CREATE TABLE job_applications (
        id integer PRIMARY KEY,
        job_id integer NOT NULL REFERENCES jobs (id) ON DELETE RESTRICT,
        candidate_id integer NOT NULL REFERENCES candidates (id) ON DELETE RESTRICT,
        status varchar(32) NOT NULL,
        applied_at timestamptz NOT NULL
      )`);
    // Chặn ứng tuyển trùng ngay ở tầng dữ liệu (kể cả khi hai request chạy song song).
    await db.query(
      'CREATE UNIQUE INDEX ux_job_applications_candidate_job ON job_applications (candidate_id, job_id)',
    );
    await db.query(
      'CREATE INDEX ix_job_applications_job_id ON job_applications (job_id)',
    );

    await db.query(`
      CREATE TABLE user_accounts (
        id integer PRIMARY KEY,
        name varchar(160) NOT NULL,
        email varchar(320) NOT NULL,
        password_hash varchar(512) NOT NULL,
        role varchar(32) NOT NULL,
        company_id integer,
        company_name varchar(200)
      )`);
    await db.query(
      'CREATE UNIQUE INDEX ux_user_accounts_email ON user_accounts (lower(email))',
    );

    await db.query(`
      CREATE TABLE refresh_tokens (
        id uuid PRIMARY KEY,
        user_id integer NOT NULL REFERENCES user_accounts (id) ON DELETE CASCADE,
        family_id uuid NOT NULL,
        token_hash char(64) NOT NULL,
        created_at timestamptz NOT NULL,
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz,
        replaced_by_token_hash char(64)
      )`);
    await db.query(
      'CREATE UNIQUE INDEX ux_refresh_tokens_token_hash ON refresh_tokens (token_hash)',
    );
    await db.query(
      'CREATE INDEX ix_refresh_tokens_family_id ON refresh_tokens (family_id)',
    );
    await db.query(
      'CREATE INDEX ix_refresh_tokens_user_expires ON refresh_tokens (user_id, expires_at)',
    );
  },
};
