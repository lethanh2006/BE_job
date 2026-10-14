import {
  AdminCompanyCriteria,
  AdminCompanyRow,
  AdminJobCriteria,
  AdminJobRow,
  AdminReader,
  AdminStats,
  AdminUserCriteria,
  AdminUserRow,
  Page,
} from '../../application/abstractions/admin';
import { AccountRole } from '../../application/auth';
import { CompanyStatus, JobStatus } from '../../domain';
import { Database } from './database';
import { escapeLike } from './job-search-query';

/** Dựng mệnh đề WHERE tham số hóa: mọi giá trị người dùng đều đi qua tham số, không nội suy chuỗi. */
function conditions() {
  const params: unknown[] = [];
  const where: string[] = [];

  return {
    params,
    bind: (value: unknown) => `$${params.push(value)}`,
    add: (clause: string) => where.push(clause),
    toSql: () => (where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''),
  };
}

export class PostgresAdminReader extends AdminReader {
  constructor(private readonly db: Database) {
    super();
  }

  async stats(): Promise<AdminStats> {
    const { rows } = await this.db.query<Record<string, number>>(`
      SELECT
        (SELECT count(*) FROM user_accounts WHERE role = '${AccountRole.Candidate}')::int AS candidates,
        (SELECT count(*) FROM user_accounts WHERE role = '${AccountRole.Employer}')::int AS employers,
        (SELECT count(*) FROM user_accounts WHERE role = '${AccountRole.Admin}')::int AS admins,
        (SELECT count(*) FROM companies WHERE status = '${CompanyStatus.Active}')::int AS companies_active,
        (SELECT count(*) FROM companies WHERE status = '${CompanyStatus.Suspended}')::int AS companies_suspended,
        (SELECT count(*) FROM jobs WHERE status = '${JobStatus.Draft}')::int AS jobs_draft,
        (SELECT count(*) FROM jobs WHERE status = '${JobStatus.Published}')::int AS jobs_published,
        (SELECT count(*) FROM jobs WHERE status = '${JobStatus.Closed}')::int AS jobs_closed,
        (SELECT count(*) FROM jobs WHERE status = '${JobStatus.Removed}')::int AS jobs_removed,
        (SELECT count(*) FROM job_applications)::int AS applications`);
    const row = rows[0];

    return {
      users: {
        candidates: row.candidates,
        employers: row.employers,
        admins: row.admins,
      },
      companies: {
        active: row.companies_active,
        suspended: row.companies_suspended,
      },
      jobs: {
        draft: row.jobs_draft,
        published: row.jobs_published,
        closed: row.jobs_closed,
        removed: row.jobs_removed,
      },
      applications: row.applications,
    };
  }

  async searchJobs(c: AdminJobCriteria): Promise<Page<AdminJobRow>> {
    const q = conditions();
    if (c.keyword)
      q.add(`j.search_text LIKE ${q.bind(`%${escapeLike(c.keyword)}%`)}`);
    if (c.status) q.add(`j.status = ${q.bind(c.status)}`);
    if (c.companyId !== undefined)
      q.add(`j.company_id = ${q.bind(c.companyId)}`);

    return this.page(
      `FROM jobs j JOIN companies c ON c.id = j.company_id ${q.toSql()}`,
      q.params,
      `j.id, j.title, j.company_id, c.name AS company, j.status, j.removal_reason, j.posted_at,
       j.deadline, (SELECT count(*) FROM job_applications a WHERE a.job_id = j.id) AS applications`,
      'j.id DESC',
      c,
      (row: JobRow): AdminJobRow => ({
        id: row.id,
        title: row.title,
        companyId: row.company_id,
        company: row.company,
        status: row.status,
        removalReason: row.removal_reason,
        applications: Number(row.applications),
        postedAt: row.posted_at,
        deadline: row.deadline,
      }),
    );
  }

  async searchCompanies(
    c: AdminCompanyCriteria,
  ): Promise<Page<AdminCompanyRow>> {
    const q = conditions();
    if (c.keyword)
      q.add(`vn_fold(c.name) LIKE ${q.bind(`%${escapeLike(c.keyword)}%`)}`);
    if (c.status) q.add(`c.status = ${q.bind(c.status)}`);

    return this.page(
      `FROM companies c ${q.toSql()}`,
      q.params,
      `c.id, c.name, c.location, c.status, c.suspension_reason,
       (SELECT count(*) FROM jobs j WHERE j.company_id = c.id) AS jobs,
       (SELECT count(*) FROM user_accounts a WHERE a.company_id = c.id) AS members`,
      'c.id',
      c,
      (row: CompanyRow): AdminCompanyRow => ({
        id: row.id,
        name: row.name,
        location: row.location,
        status: row.status,
        suspensionReason: row.suspension_reason,
        jobs: Number(row.jobs),
        members: Number(row.members),
      }),
    );
  }

  async searchUsers(c: AdminUserCriteria): Promise<Page<AdminUserRow>> {
    const q = conditions();
    if (c.keyword) {
      const pattern = q.bind(`%${escapeLike(c.keyword)}%`);
      q.add(
        `(vn_fold(a.name) LIKE ${pattern} OR lower(a.email) LIKE ${pattern})`,
      );
    }
    if (c.role) q.add(`a.role = ${q.bind(c.role)}`);
    if (c.disabled !== undefined) {
      q.add(`(a.disabled_at IS NOT NULL) = ${q.bind(c.disabled)}`);
    }

    return this.page(
      `FROM user_accounts a LEFT JOIN companies c ON c.id = a.company_id ${q.toSql()}`,
      q.params,
      `a.id, a.name, a.email, a.role, a.company_id, c.name AS company_name,
       (a.disabled_at IS NOT NULL) AS disabled`,
      'a.id',
      c,
      (row: UserRow): AdminUserRow => ({
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        companyId: row.company_id,
        companyName: row.company_name,
        disabled: row.disabled,
      }),
    );
  }

  /** Lấy một trang kèm tổng số dòng; trang vượt quá dữ liệu vẫn trả đúng tổng nhờ truy vấn đếm riêng. */
  private async page<TRow extends { total?: string }, TItem>(
    fromAndWhere: string,
    params: unknown[],
    columns: string,
    orderBy: string,
    paging: { page: number; pageSize: number },
    map: (row: TRow) => TItem,
  ): Promise<Page<TItem>> {
    const limit = `$${params.length + 1}`;
    const offset = `$${params.length + 2}`;
    const { rows } = await this.db.query<TRow>(
      `SELECT ${columns}, count(*) OVER() AS total ${fromAndWhere}
        ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`,
      [...params, paging.pageSize, (paging.page - 1) * paging.pageSize],
    );

    let total = rows.length > 0 ? Number(rows[0].total) : 0;
    if (rows.length === 0 && paging.page > 1) {
      const { rows: counts } = await this.db.query<{ total: string }>(
        `SELECT count(*) AS total ${fromAndWhere}`,
        params,
      );
      total = Number(counts[0].total);
    }

    return { items: rows.map(map), total };
  }
}

interface JobRow {
  id: number;
  title: string;
  company_id: number;
  company: string;
  status: JobStatus;
  removal_reason: string | null;
  applications: string;
  posted_at: Date;
  deadline: Date;
  total?: string;
}

interface CompanyRow {
  id: number;
  name: string;
  location: string | null;
  status: CompanyStatus;
  suspension_reason: string | null;
  jobs: string;
  members: string;
  total?: string;
}

interface UserRow {
  id: number;
  name: string;
  email: string;
  role: AccountRole;
  company_id: number | null;
  company_name: string | null;
  disabled: boolean;
  total?: string;
}
