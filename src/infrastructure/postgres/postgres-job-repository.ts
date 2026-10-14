import { Clock, Company, Job } from '../../domain';
import { JobRepository } from '../../application/abstractions/persistence';
import { Database, Queryable } from './database';
import { JobRow, jobColumns, toJob } from './row-mapper';

const JOB_COLUMNS = `title, company_id, company_name, company_location, salary_min, salary_max,
  deadline, location, level, work_mode, category, summary, description, requirements,
  benefits, posted_at, featured, status, removal_reason, skills`;

/** Chỉ đọc các cột cần cho entity (bỏ cột sinh phục vụ tìm kiếm) kèm trạng thái công ty qua JOIN. */
const SELECT_JOB = `SELECT j.id, j.title, j.company_id, j.company_name, j.company_location,
  j.salary_min, j.salary_max, j.deadline, j.location, j.level, j.work_mode, j.category, j.summary,
  j.description, j.requirements, j.benefits, j.posted_at, j.featured, j.status, j.removal_reason,
  j.skills, c.status AS company_status
  FROM jobs j LEFT JOIN companies c ON c.id = j.company_id`;

export class PostgresJobRepository extends JobRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {
    super();
  }

  async getById(id: number): Promise<Job | null> {
    const { rows } = await this.db.query<JobRow>(
      `${SELECT_JOB} WHERE j.id = $1`,
      [id],
    );
    return rows[0] ? toJob(rows[0], this.clock) : null;
  }

  async getAll(): Promise<Job[]> {
    const { rows } = await this.db.query<JobRow>(`${SELECT_JOB} ORDER BY j.id`);
    return rows.map((row) => toJob(row, this.clock));
  }

  async getByIds(ids: readonly number[]): Promise<Job[]> {
    if (ids.length === 0) return [];
    const { rows } = await this.db.query<JobRow>(
      `${SELECT_JOB} WHERE j.id = ANY($1::int[]) ORDER BY j.id`,
      [ids],
    );
    return rows.map((row) => toJob(row, this.clock));
  }

  async getByCompanyId(companyId: number): Promise<Job[]> {
    const { rows } = await this.db.query<JobRow>(
      `${SELECT_JOB} WHERE j.company_id = $1 ORDER BY j.id`,
      [companyId],
    );
    return rows.map((row) => toJob(row, this.clock));
  }

  async updateCompanySnapshot(company: Company): Promise<void> {
    await this.db.query(
      'UPDATE jobs SET company_name = $2, company_location = $3 WHERE company_id = $1',
      [company.id, company.name, company.location ?? null],
    );
  }

  async getNextId(): Promise<number> {
    const { rows } = await this.db.query<{ id: number }>(
      "SELECT nextval('job_ids')::integer AS id",
    );
    return rows[0].id;
  }

  async add(entity: Job): Promise<void> {
    await insertJob(this.db, entity);
  }

  async update(entity: Job): Promise<void> {
    const assignments = JOB_COLUMNS.split(',')
      .map((column, index) => `${column.trim()} = $${index + 2}`)
      .join(', ');
    const { rowCount } = await this.db.query(
      `UPDATE jobs SET ${assignments} WHERE id = $1`,
      [entity.id, ...jobColumns(entity)],
    );
    if (rowCount === 0) {
      throw new Error(`Tin tuyển dụng có mã ${entity.id} không tồn tại.`);
    }
  }
}

export async function insertJob(db: Queryable, job: Job): Promise<void> {
  const placeholders = Array.from({ length: 20 }, (_, i) => `$${i + 2}`);
  await db.query(
    `INSERT INTO jobs (id, ${JOB_COLUMNS}) VALUES ($1, ${placeholders.join(', ')})`,
    [job.id, ...jobColumns(job)],
  );
}
