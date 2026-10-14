import { Page } from './admin';

export interface SavedJob {
  jobId: number;
  savedAt: Date;
}

export abstract class SavedJobRepository {
  /** Thêm một lần; gọi lại không đổi thời điểm hoặc tạo bản ghi trùng. */
  abstract save(
    candidateId: number,
    jobId: number,
    savedAt: Date,
  ): Promise<void>;
  abstract remove(candidateId: number, jobId: number): Promise<void>;
  abstract savedIds(
    candidateId: number,
    jobIds: readonly number[],
  ): Promise<number[]>;
  abstract list(
    candidateId: number,
    page: number,
    pageSize: number,
  ): Promise<Page<SavedJob>>;
}
