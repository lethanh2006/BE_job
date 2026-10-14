import type { Migration } from './migration';

export const savedJobs: Migration = {
  id: '0006_saved_jobs',
  async up(db) {
    await db.query(`CREATE TABLE saved_jobs (
      candidate_id integer NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
      job_id integer NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
      saved_at timestamptz NOT NULL,
      PRIMARY KEY (candidate_id, job_id)
    )`);
    await db.query(
      'CREATE INDEX ix_saved_jobs_candidate_saved ON saved_jobs (candidate_id, saved_at DESC, job_id DESC)',
    );
  },
};
