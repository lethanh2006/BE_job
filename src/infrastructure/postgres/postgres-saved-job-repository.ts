import {
  SavedJob,
  SavedJobRepository,
} from '../../application/abstractions/saved-jobs';
import { Database } from './database';

export class PostgresSavedJobRepository extends SavedJobRepository {
  constructor(private readonly db: Database) {
    super();
  }

  async save(candidateId: number, jobId: number, savedAt: Date): Promise<void> {
    await this.db.query(
      'INSERT INTO saved_jobs (candidate_id, job_id, saved_at) VALUES ($1, $2, $3) ON CONFLICT (candidate_id, job_id) DO NOTHING',
      [candidateId, jobId, savedAt],
    );
  }

  async remove(candidateId: number, jobId: number): Promise<void> {
    await this.db.query(
      'DELETE FROM saved_jobs WHERE candidate_id = $1 AND job_id = $2',
      [candidateId, jobId],
    );
  }

  async savedIds(
    candidateId: number,
    jobIds: readonly number[],
  ): Promise<number[]> {
    if (jobIds.length === 0) return [];
    const { rows } = await this.db.query<{ job_id: number }>(
      'SELECT job_id FROM saved_jobs WHERE candidate_id = $1 AND job_id = ANY($2::integer[]) ORDER BY job_id',
      [candidateId, jobIds],
    );
    return rows.map((row) => row.job_id);
  }

  async list(
    candidateId: number,
    page: number,
    pageSize: number,
  ): Promise<{ items: SavedJob[]; total: number }> {
    const [result, count] = await Promise.all([
      this.db.query<{ job_id: number; saved_at: Date }>(
        'SELECT job_id, saved_at FROM saved_jobs WHERE candidate_id = $1 ORDER BY saved_at DESC, job_id DESC LIMIT $2 OFFSET $3',
        [candidateId, pageSize, (page - 1) * pageSize],
      ),
      this.db.query<{ total: string }>(
        'SELECT count(*) AS total FROM saved_jobs WHERE candidate_id = $1',
        [candidateId],
      ),
    ]);
    return {
      items: result.rows.map((row) => ({
        jobId: row.job_id,
        savedAt: row.saved_at,
      })),
      total: Number(count.rows[0].total),
    };
  }
}
