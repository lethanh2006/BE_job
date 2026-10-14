import { AlreadyAppliedException, JobApplication } from '../../domain';
import { JobApplicationRepository } from '../../application/abstractions/persistence';
import { Database, isPgError, PgErrorCode, Queryable } from './database';
import { ApplicationRow, toApplication } from './row-mapper';

export class PostgresJobApplicationRepository extends JobApplicationRepository {
  constructor(private readonly db: Database) {
    super();
  }

  async getById(id: number): Promise<JobApplication | null> {
    const { rows } = await this.db.query<ApplicationRow>(
      'SELECT * FROM job_applications WHERE id = $1',
      [id],
    );
    return rows[0] ? toApplication(rows[0]) : null;
  }

  async getNextId(): Promise<number> {
    const { rows } = await this.db.query<{ id: number }>(
      "SELECT nextval('application_ids')::integer AS id",
    );
    return rows[0].id;
  }

  async getAll(): Promise<JobApplication[]> {
    const { rows } = await this.db.query<ApplicationRow>(
      'SELECT * FROM job_applications ORDER BY id',
    );
    return rows.map(toApplication);
  }

  async hasApplied(candidateId: number, jobId: number): Promise<boolean> {
    const { rows } = await this.db.query(
      'SELECT 1 FROM job_applications WHERE candidate_id = $1 AND job_id = $2 LIMIT 1',
      [candidateId, jobId],
    );
    return rows.length > 0;
  }

  async getByCandidateId(candidateId: number): Promise<JobApplication[]> {
    const { rows } = await this.db.query<ApplicationRow>(
      'SELECT * FROM job_applications WHERE candidate_id = $1 ORDER BY applied_at DESC, id DESC',
      [candidateId],
    );
    return rows.map(toApplication);
  }

  async getByJobId(jobId: number): Promise<JobApplication[]> {
    const { rows } = await this.db.query<ApplicationRow>(
      'SELECT * FROM job_applications WHERE job_id = $1 ORDER BY applied_at DESC, id DESC',
      [jobId],
    );
    return rows.map(toApplication);
  }

  async getByJobIds(jobIds: readonly number[]): Promise<JobApplication[]> {
    if (jobIds.length === 0) return [];
    const { rows } = await this.db.query<ApplicationRow>(
      `SELECT * FROM job_applications WHERE job_id = ANY($1::int[])
        ORDER BY applied_at DESC, id DESC`,
      [jobIds],
    );
    return rows.map(toApplication);
  }

  async countByJobIds(jobIds: readonly number[]): Promise<Map<number, number>> {
    if (jobIds.length === 0) return new Map();
    const { rows } = await this.db.query<{ job_id: number; total: string }>(
      `SELECT job_id, count(*) AS total FROM job_applications
        WHERE job_id = ANY($1::int[]) GROUP BY job_id`,
      [jobIds],
    );
    return new Map(rows.map((row) => [row.job_id, Number(row.total)]));
  }

  async add(entity: JobApplication): Promise<void> {
    try {
      await insertApplication(this.db, entity);
    } catch (error) {
      // Ràng buộc unique (candidate_id, job_id) chặn nộp trùng kể cả khi hai request song song.
      if (isPgError(error, PgErrorCode.UniqueViolation)) {
        throw new AlreadyAppliedException(
          'Ứng viên đã ứng tuyển vào tin tuyển dụng này.',
        );
      }
      throw error;
    }
  }

  async update(entity: JobApplication): Promise<void> {
    const { rowCount } = await this.db.query(
      'UPDATE job_applications SET status = $2 WHERE id = $1',
      [entity.id, entity.status],
    );
    if (rowCount === 0) {
      throw new Error(`Đơn ứng tuyển có mã ${entity.id} không tồn tại.`);
    }
  }
}

export async function insertApplication(
  db: Queryable,
  application: JobApplication,
): Promise<void> {
  await db.query(
    `INSERT INTO job_applications (id, job_id, candidate_id, status, applied_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      application.id,
      application.jobId,
      application.candidateId,
      application.status,
      application.appliedAt,
    ],
  );
}
