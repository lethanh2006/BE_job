import { Candidate, Job, JobApplication } from '../../domain';

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
