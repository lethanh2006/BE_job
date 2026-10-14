import { Injectable } from '@nestjs/common';
import { JobStatus } from '../../domain';
import {
  CandidateRepository,
  JobApplicationRepository,
  JobRepository,
  JobSearchReader,
} from '../abstractions/persistence';
import { ResourceNotFoundException } from '../exceptions';
import { JobSortOrder, RecommendedJobDto } from '../jobs/dto';
import { JobMatchService, MatchBreakdown } from './job-match.service';

export interface JobMatchDto extends MatchBreakdown {
  jobId: number;
}

/** Số tin mới nhất được chấm điểm khi gợi ý; đủ rộng mà vẫn chặn chi phí mỗi request. */
const RECOMMENDATION_POOL_SIZE = 100;

/** Độ phù hợp của ứng viên đang đăng nhập với các tin tuyển dụng công khai. */
@Injectable()
export class CandidateMatchService {
  constructor(
    private readonly candidates: CandidateRepository,
    private readonly jobs: JobRepository,
    private readonly applications: JobApplicationRepository,
    private readonly searchReader: JobSearchReader,
    private readonly matching: JobMatchService,
  ) {}

  /** Chấm điểm các tin đã công khai (Published/Closed); mã không tồn tại hoặc là bản nháp bị bỏ qua. */
  async getMatches(
    candidateId: number,
    jobIds: number[],
  ): Promise<JobMatchDto[]> {
    const candidate = await this.getCandidate(candidateId);
    const jobs = await this.jobs.getByIds([...new Set(jobIds)]);

    return jobs
      .filter((job) => job.status !== JobStatus.Draft)
      .map((job) => ({
        jobId: job.id,
        ...this.matching.breakdown(job, candidate),
      }));
  }

  /** Tin đang tuyển phù hợp nhất mà ứng viên chưa ứng tuyển; bỏ tin không khớp chút nào. */
  async recommend(
    candidateId: number,
    limit: number,
  ): Promise<RecommendedJobDto[]> {
    const candidate = await this.getCandidate(candidateId);
    const { items } = await this.searchReader.search({
      skills: [],
      sort: JobSortOrder.Newest,
      page: 1,
      pageSize: RECOMMENDATION_POOL_SIZE,
    });
    const applied = new Set(
      (await this.applications.getByCandidateId(candidateId)).map(
        (a) => a.jobId,
      ),
    );
    const open = items.filter((item) => !applied.has(item.id));
    const jobs = new Map(
      (await this.jobs.getByIds(open.map((item) => item.id))).map((job) => [
        job.id,
        job,
      ]),
    );

    return open
      .map((item) => ({
        ...item,
        matchScore: this.matching.score(jobs.get(item.id)!, candidate),
      }))
      .filter((item) => item.matchScore > 0)
      .sort(
        (a, b) =>
          b.matchScore - a.matchScore ||
          b.postedAt.getTime() - a.postedAt.getTime() ||
          a.id - b.id,
      )
      .slice(0, limit);
  }

  private async getCandidate(candidateId: number) {
    const candidate = await this.candidates.getById(candidateId);
    if (!candidate) {
      throw new ResourceNotFoundException(
        `Không tìm thấy ứng viên có mã ${candidateId}.`,
      );
    }
    return candidate;
  }
}
