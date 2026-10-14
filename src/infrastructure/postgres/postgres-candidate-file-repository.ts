import {
  CandidateFile,
  CandidateFileRepository,
} from '../../application/abstractions/files';
import { Database } from './database';

interface FileRow {
  id: string;
  candidate_id: number;
  file_name: string;
  content_type: string;
  size_bytes: number;
  storage_key: string;
  uploaded_at: Date;
}

const COLUMNS =
  'id, candidate_id, file_name, content_type, size_bytes, storage_key, uploaded_at';

const toFile = (row: FileRow): CandidateFile => ({
  id: row.id,
  candidateId: row.candidate_id,
  fileName: row.file_name,
  contentType: row.content_type,
  sizeBytes: row.size_bytes,
  storageKey: row.storage_key,
  uploadedAt: row.uploaded_at,
});

export class PostgresCandidateFileRepository extends CandidateFileRepository {
  constructor(private readonly db: Database) {
    super();
  }

  /** Bỏ cờ "hiện tại" của CV cũ rồi thêm CV mới trong một giao dịch. */
  addAsCurrent(file: CandidateFile): Promise<void> {
    return this.db.transaction(async (tx) => {
      await tx.query(
        'UPDATE candidate_files SET is_current = false WHERE candidate_id = $1 AND is_current',
        [file.candidateId],
      );
      await tx.query(
        `INSERT INTO candidate_files (${COLUMNS}, is_current)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
        [
          file.id,
          file.candidateId,
          file.fileName,
          file.contentType,
          file.sizeBytes,
          file.storageKey,
          file.uploadedAt,
        ],
      );
    });
  }

  async getById(id: string): Promise<CandidateFile | null> {
    const { rows } = await this.db.query<FileRow>(
      `SELECT ${COLUMNS} FROM candidate_files WHERE id = $1`,
      [id],
    );
    return rows[0] ? toFile(rows[0]) : null;
  }

  async getCurrent(candidateId: number): Promise<CandidateFile | null> {
    const { rows } = await this.db.query<FileRow>(
      `SELECT ${COLUMNS} FROM candidate_files WHERE candidate_id = $1 AND is_current`,
      [candidateId],
    );
    return rows[0] ? toFile(rows[0]) : null;
  }

  async clearCurrent(candidateId: number): Promise<void> {
    await this.db.query(
      'UPDATE candidate_files SET is_current = false WHERE candidate_id = $1 AND is_current',
      [candidateId],
    );
  }

  async isReferencedByApplication(fileId: string): Promise<boolean> {
    const { rows } = await this.db.query(
      'SELECT 1 FROM job_applications WHERE cv_file_id = $1 LIMIT 1',
      [fileId],
    );
    return rows.length > 0;
  }

  async delete(id: string): Promise<void> {
    await this.db.query('DELETE FROM candidate_files WHERE id = $1', [id]);
  }
}
