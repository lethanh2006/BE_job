import { Injectable } from '@nestjs/common';
import {
  ArgumentError,
  Clock,
  JobClosedException,
  JobStatus,
} from '../../domain';
import { JobRepository } from '../abstractions/persistence';
import { SavedJobRepository } from '../abstractions/saved-jobs';
import { PagedResult } from '../common/paged-result';
import { ResourceNotFoundException } from '../exceptions';
import { JobSummaryDto } from '../jobs/dto';
import { toJobSummary } from '../jobs/job-mapping';

export interface SavedJobDto {
  jobId: number;
  savedAt: Date;
  availability: 'Open' | 'Closed' | 'Expired' | 'Unavailable';
  /** Tin bị gỡ, bản nháp hoặc công ty bị khóa không lộ nội dung qua danh sách đã lưu. */
  job: JobSummaryDto | null;
}

@Injectable()
export class SavedJobService {
  constructor(
    private readonly saved: SavedJobRepository,
    private readonly jobs: JobRepository,
    private readonly clock: Clock,
  ) {}

  async save(candidateId: number, jobId: number): Promise<void> {
    if ((await this.saved.savedIds(candidateId, [jobId])).length > 0) return;
    const job = await this.jobs.getById(jobId);
    if (!job?.isPubliclyVisible)
      throw new ResourceNotFoundException('Không tìm thấy tin tuyển dụng.');
    if (job.status !== JobStatus.Published || job.isExpired) {
      throw new JobClosedException(
        'Tin đã đóng hoặc hết hạn nên không thể lưu mới.',
      );
    }
    await this.saved.save(candidateId, jobId, this.clock.utcNow);
  }

  remove(candidateId: number, jobId: number): Promise<void> {
    return this.saved.remove(candidateId, jobId);
  }

  savedIds(candidateId: number, jobIds: readonly number[]): Promise<number[]> {
    return this.saved.savedIds(candidateId, [...new Set(jobIds)]);
  }

  async list(
    candidateId: number,
    page = 1,
    pageSize = 20,
  ): Promise<PagedResult<SavedJobDto>> {
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    ) {
      throw new ArgumentError(
        'Phân trang không hợp lệ. Số trang từ 1, kích thước trang từ 1 đến 100.',
      );
    }
    const { items, total } = await this.saved.list(candidateId, page, pageSize);
    const jobs = new Map(
      (await this.jobs.getByIds(items.map((item) => item.jobId))).map((job) => [
        job.id,
        job,
      ]),
    );
    return new PagedResult(
      items.map((item): SavedJobDto => {
        const job = jobs.get(item.jobId);
        if (!job?.isPubliclyVisible)
          return { ...item, availability: 'Unavailable', job: null };
        return {
          ...item,
          job: toJobSummary(job),
          availability:
            job.status === JobStatus.Closed
              ? 'Closed'
              : job.isExpired
                ? 'Expired'
                : 'Open',
        };
      }),
      page,
      pageSize,
      total,
    );
  }
}
