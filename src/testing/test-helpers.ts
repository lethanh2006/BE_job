import { JobRepository } from '../application/abstractions/persistence';
import {
  Clock,
  Company,
  Job,
  JobLevel,
  SalaryRange,
  Skill,
  WorkMode,
} from '../domain';

export const T0 = new Date('2026-01-01T00:00:00Z');

/** Đồng hồ giả cho phép tua thời gian trong test. */
export class MutableClock extends Clock {
  constructor(public now: Date = T0) {
    super();
  }

  get utcNow(): Date {
    return this.now;
  }

  advanceDays(days: number): void {
    this.now = new Date(this.now.getTime() + days * 86_400_000);
  }
}

export interface JobOptions {
  id?: number;
  title?: string;
  companyId?: number;
  salary?: [number, number];
  skills?: string[];
  publish?: boolean;
  location?: string;
  category?: string;
  level?: JobLevel;
  deadlineDays?: number;
}

/** Dựng Job hợp lệ cho test; mặc định hạn nộp sau 7 ngày kể từ `clock`. */
export function makeJob(clock: Clock, options: JobOptions = {}): Job {
  const companyId = options.companyId ?? 30;
  const job = Job.create({
    id: options.id ?? 1,
    title: options.title ?? 'Backend Developer',
    companyId,
    salary: new SalaryRange(...(options.salary ?? [1000, 2000])),
    deadline: new Date(
      clock.utcNow.getTime() + (options.deadlineDays ?? 7) * 86_400_000,
    ),
    clock,
    company: new Company(companyId, `Công ty ${companyId}`),
    location: options.location ?? '',
    level: options.level ?? JobLevel.Middle,
    workMode: WorkMode.Onsite,
    category: options.category ?? '',
  });
  (options.skills ?? []).forEach((skill) => job.addSkill(new Skill(skill)));
  if (options.publish ?? true) job.publish();

  return job;
}

/** Repository tin tuyển dụng tối giản, rỗng ban đầu (khác bản in-memory có seed). */
export class FakeJobRepository extends JobRepository {
  private readonly jobs = new Map<number, Job>();

  seed(...jobs: Job[]): this {
    jobs.forEach((job) => this.jobs.set(job.id, job));
    return this;
  }

  getById(id: number): Promise<Job | null> {
    return Promise.resolve(this.jobs.get(id) ?? null);
  }

  getAll(): Promise<Job[]> {
    return Promise.resolve([...this.jobs.values()]);
  }

  getByIds(ids: readonly number[]): Promise<Job[]> {
    return Promise.resolve(ids.flatMap((id) => this.jobs.get(id) ?? []));
  }

  getByCompanyId(companyId: number): Promise<Job[]> {
    return Promise.resolve(
      [...this.jobs.values()].filter((job) => job.companyId === companyId),
    );
  }

  getNextId(): Promise<number> {
    return Promise.resolve(Math.max(0, ...this.jobs.keys()) + 1);
  }

  add(entity: Job): Promise<void> {
    this.jobs.set(entity.id, entity);
    return Promise.resolve();
  }

  update(entity: Job): Promise<void> {
    this.jobs.set(entity.id, entity);
    return Promise.resolve();
  }
}
