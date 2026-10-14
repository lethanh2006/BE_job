import { Candidate } from '../../domain';
import { CandidateRepository } from '../../application/abstractions/persistence';
import { EmailAlreadyExistsException } from '../../application/exceptions';
import { Database, isPgError, PgErrorCode, Queryable } from './database';
import { CandidateRow, toCandidate } from './row-mapper';

export class PostgresCandidateRepository extends CandidateRepository {
  constructor(private readonly db: Database) {
    super();
  }

  async getById(id: number): Promise<Candidate | null> {
    const { rows } = await this.db.query<CandidateRow>(
      'SELECT * FROM candidates WHERE id = $1',
      [id],
    );
    return rows[0] ? toCandidate(rows[0]) : null;
  }

  async add(entity: Candidate): Promise<void> {
    await insertCandidate(this.db, entity);
  }

  async update(entity: Candidate): Promise<void> {
    try {
      const { rowCount } = await this.db.query(
        `UPDATE candidates
            SET name = $2, email = $3, bio = $4, desired_salary_min = $5,
                desired_salary_max = $6, skills = $7
          WHERE id = $1`,
        [
          entity.id,
          entity.name,
          entity.email,
          entity.bio,
          entity.desiredSalary?.min ?? null,
          entity.desiredSalary?.max ?? null,
          entity.skills.map((skill) => skill.name),
        ],
      );
      if (rowCount === 0) {
        throw new Error(`Ứng viên có mã ${entity.id} không tồn tại.`);
      }
    } catch (error) {
      if (isPgError(error, PgErrorCode.UniqueViolation)) {
        throw new EmailAlreadyExistsException('Email này đã được sử dụng.');
      }
      throw error;
    }
  }
}

export async function insertCandidate(
  db: Queryable,
  candidate: Candidate,
): Promise<void> {
  await db.query(
    `INSERT INTO candidates
       (id, name, email, bio, desired_salary_min, desired_salary_max, skills)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      candidate.id,
      candidate.name,
      candidate.email,
      candidate.bio,
      candidate.desiredSalary?.min ?? null,
      candidate.desiredSalary?.max ?? null,
      candidate.skills.map((skill) => skill.name),
    ],
  );
}
