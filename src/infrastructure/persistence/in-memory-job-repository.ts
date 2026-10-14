import { readFile } from 'node:fs/promises';
import {
  Clock,
  Company,
  Job,
  JobLevel,
  JobStatus,
  SalaryRange,
  Skill,
  WorkMode,
} from '../../domain';
import { JobRepository } from '../../application/abstractions/persistence';

export interface JobSeed {
  id: number;
  title: string;
  companyId: number;
  company: string;
  location: string;
  salaryMin: number;
  salaryMax: number;
  level: JobLevel;
  workMode: WorkMode;
  category: string;
  summary: string;
  description: string[];
  requirements: string[];
  benefits: string[];
  postedAt: string;
  deadline: string;
  status: JobStatus;
  featured: boolean;
  skills: string[];
}

const DAY_MS = 86_400_000;
const MIN_REMAINING_MS = 14 * DAY_MS;

/**
 * Dữ liệu mẫu có ngày cố định sẽ hết hạn theo thời gian; dịch tất cả ngày đi một số ngày
 * nguyên để tin đang đăng sớm nhất luôn còn ít nhất 14 ngày. Quan hệ giữa các ngày giữ nguyên.
 */
export function seedDateShiftMs(seeds: readonly JobSeed[], now: Date): number {
  const open = seeds.filter((seed) => seed.status === JobStatus.Published);
  if (open.length === 0) return 0;

  const earliestDeadline = Math.min(
    ...open.map((seed) => Date.parse(seed.deadline)),
  );
  const missing = now.getTime() + MIN_REMAINING_MS - earliestDeadline;

  return missing > 0 ? Math.ceil(missing / DAY_MS) * DAY_MS : 0;
}

/** Repository lưu trong bộ nhớ, nạp dữ liệu ban đầu từ file JSON seed. */
export class InMemoryJobRepository extends JobRepository {
  private jobs: Map<number, Job> | null = null;
  private loading: Promise<Map<number, Job>> | null = null;
  private lastId = 0;

  constructor(
    private readonly seedFilePath: string,
    private readonly clock: Clock,
  ) {
    super();
  }

  async getById(id: number): Promise<Job | null> {
    return (await this.load()).get(id) ?? null;
  }

  async getAll(): Promise<Job[]> {
    return [...(await this.load()).values()];
  }

  async getByIds(ids: readonly number[]): Promise<Job[]> {
    const jobs = await this.load();
    return ids.flatMap((id) => jobs.get(id) ?? []);
  }

  async getByCompanyId(companyId: number): Promise<Job[]> {
    return [...(await this.load()).values()].filter(
      (job) => job.companyId === companyId,
    );
  }

  async getNextId(): Promise<number> {
    await this.load();
    return ++this.lastId;
  }

  async add(entity: Job): Promise<void> {
    const jobs = await this.load();
    if (jobs.has(entity.id)) {
      throw new Error(`Tin tuyển dụng có mã ${entity.id} đã tồn tại.`);
    }
    jobs.set(entity.id, entity);
    this.lastId = Math.max(this.lastId, entity.id);
  }

  async update(entity: Job): Promise<void> {
    (await this.load()).set(entity.id, entity);
  }

  private load(): Promise<Map<number, Job>> {
    if (this.jobs) return Promise.resolve(this.jobs);

    this.loading ??= readFile(this.seedFilePath, 'utf8').then((content) => {
      const seeds = JSON.parse(content) as JobSeed[];
      const shiftMs = seedDateShiftMs(seeds, this.clock.utcNow);
      this.jobs = new Map(
        seeds.map((seed) => {
          const job = this.toJob(seed, shiftMs);
          return [job.id, job] as const;
        }),
      );
      this.lastId = Math.max(0, ...this.jobs.keys());
      return this.jobs;
    });

    return this.loading;
  }

  private toJob(seed: JobSeed, shiftMs: number): Job {
    const job = Job.restore({
      id: seed.id,
      title: seed.title,
      companyId: seed.companyId,
      salary: new SalaryRange(seed.salaryMin, seed.salaryMax),
      deadline: new Date(Date.parse(seed.deadline) + shiftMs),
      clock: this.clock,
      company: new Company(seed.companyId, seed.company, seed.location),
      location: seed.location,
      level: seed.level,
      workMode: seed.workMode,
      category: seed.category,
      summary: seed.summary,
      description: seed.description,
      requirements: seed.requirements,
      benefits: seed.benefits,
      postedAt: new Date(Date.parse(seed.postedAt) + shiftMs),
      featured: seed.featured,
      status: seed.status,
    });
    seed.skills.forEach((skill) => job.addSkill(new Skill(skill)));

    return job;
  }
}
