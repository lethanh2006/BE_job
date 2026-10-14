import { Injectable } from '@nestjs/common';
import {
  Clock,
  Company,
  Job,
  JobManagementForbiddenException,
  SalaryRange,
  Skill,
  User,
} from '../../domain';
import {
  JobApplicationRepository,
  JobRepository,
} from '../abstractions/persistence';
import { ResourceNotFoundException } from '../exceptions';
import {
  CreateJobCommand,
  EmployerJobDetailDto,
  EmployerJobDto,
  JobContentCommand,
  UpdateJobCommand,
} from './dto';
import { sortedSkillNames } from './job-mapping';

@Injectable()
export class JobManagementService {
  constructor(
    private readonly jobs: JobRepository,
    private readonly applications: JobApplicationRepository,
    private readonly clock: Clock,
  ) {}

  async getByCompanyId(companyId: number): Promise<EmployerJobDto[]> {
    const jobs = await this.jobs.getByCompanyId(companyId);
    const counts = await this.applications.countByJobIds(
      jobs.map((job) => job.id),
    );

    return jobs
      .sort(
        (a, b) => b.postedAt.getTime() - a.postedAt.getTime() || b.id - a.id,
      )
      .map((job) => toEmployerJob(job, counts.get(job.id) ?? 0));
  }

  async getDetail(jobId: number, manager: User): Promise<EmployerJobDetailDto> {
    const job = await this.getManagedJob(jobId, manager);
    const applications = await this.applications.getByJobId(job.id);

    return toEmployerJobDetail(job, applications.length);
  }

  async createDraft(command: CreateJobCommand): Promise<EmployerJobDto> {
    const job = Job.create({
      id: await this.jobs.getNextId(),
      companyId: command.companyId,
      company: new Company(
        command.companyId,
        command.companyName,
        command.location,
      ),
      clock: this.clock,
      postedAt: this.clock.utcNow,
      ...toJobContent(command),
    });

    command.skills.forEach((skill) => job.addSkill(new Skill(skill)));
    await this.jobs.add(job);

    return toEmployerJob(job, 0);
  }

  /** Thay thế toàn bộ nội dung tin (PUT); không áp dụng cho tin đã đóng. */
  async update(
    jobId: number,
    manager: User,
    command: UpdateJobCommand,
  ): Promise<EmployerJobDetailDto> {
    const job = await this.getManagedJob(jobId, manager);

    job.update(
      toJobContent(command),
      command.skills.map((skill) => new Skill(skill)),
    );
    await this.jobs.update(job);
    const applications = await this.applications.getByJobId(job.id);

    return toEmployerJobDetail(job, applications.length);
  }

  publish(jobId: number, manager: User): Promise<EmployerJobDto> {
    return this.changeState(jobId, manager, (job) => job.publish());
  }

  close(jobId: number, manager: User): Promise<EmployerJobDto> {
    return this.changeState(jobId, manager, (job) => job.close());
  }

  private async getManagedJob(jobId: number, manager: User): Promise<Job> {
    const job = await this.jobs.getById(jobId);
    if (!job) {
      throw new ResourceNotFoundException(
        `Không tìm thấy tin tuyển dụng có mã ${jobId}.`,
      );
    }
    if (!manager.canManage(job)) {
      throw new JobManagementForbiddenException(
        'Người dùng không có quyền quản lý tin tuyển dụng này.',
      );
    }

    return job;
  }

  private async changeState(
    jobId: number,
    manager: User,
    change: (job: Job) => void,
  ): Promise<EmployerJobDto> {
    const job = await this.getManagedJob(jobId, manager);

    change(job);
    await this.jobs.update(job);
    const applications = await this.applications.getByJobId(job.id);

    return toEmployerJob(job, applications.length);
  }
}

const toJobContent = (command: JobContentCommand) => ({
  title: command.title,
  salary: new SalaryRange(command.salaryMin, command.salaryMax),
  deadline: command.deadline,
  location: command.location,
  level: command.level,
  workMode: command.workMode,
  category: command.category,
  summary: command.summary,
  description: command.description,
  requirements: command.requirements,
  benefits: command.benefits,
});

const toEmployerJob = (job: Job, applications: number): EmployerJobDto => ({
  id: job.id,
  title: job.title,
  status: job.status,
  applications,
  deadline: job.deadline,
  postedAt: job.postedAt,
});

const toEmployerJobDetail = (
  job: Job,
  applications: number,
): EmployerJobDetailDto => ({
  ...toEmployerJob(job, applications),
  location: job.location,
  salaryMin: job.salary.min,
  salaryMax: job.salary.max,
  level: job.level,
  workMode: job.workMode,
  category: job.category,
  summary: job.summary,
  description: job.description,
  requirements: job.requirements,
  benefits: job.benefits,
  skills: sortedSkillNames(job),
  featured: job.featured,
});
