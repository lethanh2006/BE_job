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

interface JobSeed {
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
      this.jobs = new Map(
        seeds.map((seed) => {
          const job = this.toJob(seed);
          return [job.id, job] as const;
        }),
      );
      this.lastId = Math.max(0, ...this.jobs.keys());
      return this.jobs;
    });

    return this.loading;
  }

  private toJob(seed: JobSeed): Job {
    const job = Job.restore({
      id: seed.id,
      title: seed.title,
      companyId: seed.companyId,
      salary: new SalaryRange(seed.salaryMin, seed.salaryMax),
      deadline: new Date(seed.deadline),
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
      postedAt: new Date(seed.postedAt),
      featured: seed.featured,
      status: seed.status,
    });
    seed.skills.forEach((skill) => job.addSkill(new Skill(skill)));

    return job;
  }
}
