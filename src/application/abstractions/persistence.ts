import { Candidate, Job, JobApplication, JobLevel } from '../../domain';
import { JobSortOrder, JobSummaryDto } from '../jobs/dto';

export interface Repository<TEntity> {
  getById(id: number): Promise<TEntity | null>;
  add(entity: TEntity): Promise<void>;
  update(entity: TEntity): Promise<void>;
}

export abstract class JobRepository implements Repository<Job> {
  abstract getById(id: number): Promise<Job | null>;
  abstract add(entity: Job): Promise<void>;
  abstract update(entity: Job): Promise<void>;
  abstract getNextId(): Promise<number>;
  abstract getAll(): Promise<Job[]>;
  abstract getByIds(ids: readonly number[]): Promise<Job[]>;
  abstract getByCompanyId(companyId: number): Promise<Job[]>;
}

export abstract class CandidateRepository implements Repository<Candidate> {
  abstract getById(id: number): Promise<Candidate | null>;
  abstract add(entity: Candidate): Promise<void>;
  abstract update(entity: Candidate): Promise<void>;
  abstract getByIds(ids: readonly number[]): Promise<Candidate[]>;
}

export abstract class JobApplicationRepository implements Repository<JobApplication> {
  abstract getById(id: number): Promise<JobApplication | null>;
  abstract add(entity: JobApplication): Promise<void>;
  abstract update(entity: JobApplication): Promise<void>;
  abstract getNextId(): Promise<number>;
  abstract getAll(): Promise<JobApplication[]>;
  abstract hasApplied(candidateId: number, jobId: number): Promise<boolean>;
  abstract getByCandidateId(candidateId: number): Promise<JobApplication[]>;
  abstract getByJobId(jobId: number): Promise<JobApplication[]>;
  abstract getByJobIds(jobIds: readonly number[]): Promise<JobApplication[]>;
  /** Số đơn theo từng tin; tin chưa có đơn không xuất hiện trong kết quả. */
  abstract countByJobIds(
    jobIds: readonly number[],
  ): Promise<Map<number, number>>;
}

/** Điều kiện tìm kiếm đã được chuẩn hóa (đã trim, kỹ năng không rỗng, trang hợp lệ). */
export interface JobSearchCriteria {
  keyword?: string;
  location?: string;
  category?: string;
  level?: JobLevel;
  minimumSalary?: number;
  /**
   * Tin phải có đủ tất cả kỹ năng này. Đã được `foldText` (không dấu, chữ thường); so khớp chính xác.
   * Từ khóa, địa điểm, lĩnh vực cũng so khớp kiểu "chứa" không phân biệt hoa thường và dấu.
   */
  skills: string[];
  sort: JobSortOrder;
  page: number;
  pageSize: number;
}

export interface JobSearchPage {
  items: JobSummaryDto[];
  /** Tổng số tin khớp điều kiện (không phụ thuộc phân trang). */
  total: number;
}

/**
 * Phía đọc (query side) cho tìm kiếm tin đang tuyển: lọc, sắp xếp và phân trang diễn ra ở
 * nơi lưu trữ và chỉ trả các cột cần cho danh sách, không tải toàn bộ nội dung từng tin.
 */
export abstract class JobSearchReader {
  abstract search(criteria: JobSearchCriteria): Promise<JobSearchPage>;
}
