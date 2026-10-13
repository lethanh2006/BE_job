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
import { CreateJobCommand, EmployerJobDto } from './dto';

@Injectable()
export class JobManagementService {
  constructor(
    private readonly jobs: JobRepository,
    private readonly applications: JobApplicationRepository,
    private readonly clock: Clock,
  ) {}

  async getByCompanyId(companyId: number): Promise<EmployerJobDto[]> {
    const allApplications = await this.applications.getAll();

    return (await this.jobs.getAll())
      .filter((job) => job.companyId === companyId)
      .sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime())
      .map((job) =>
        toEmployerJob(
          job,
          allApplications.filter((a) => a.jobId === job.id).length,
        ),
      );
  }

  async createDraft(command: CreateJobCommand): Promise<EmployerJobDto> {
    const job = Job.create({
      id: await this.jobs.getNextId(),
      title: command.title,
      companyId: command.companyId,
      salary: new SalaryRange(command.salaryMin, command.salaryMax),
      deadline: command.deadline,
      clock: this.clock,
      company: new Company(
        command.companyId,
        command.companyName,
        command.location,
      ),
      location: command.location,
      level: command.level,
      workMode: command.workMode,
      category: command.category,
      summary: command.summary,
      postedAt: this.clock.utcNow,
    });

    command.skills.forEach((skill) => job.addSkill(new Skill(skill)));
    await this.jobs.add(job);

    return toEmployerJob(job, 0);
  }

  publish(jobId: number, manager: User): Promise<EmployerJobDto> {
    return this.changeState(jobId, manager, (job) => job.publish());
  }

  close(jobId: number, manager: User): Promise<EmployerJobDto> {
    return this.changeState(jobId, manager, (job) => job.close());
  }

  private async changeState(
    jobId: number,
    manager: User,
    change: (job: Job) => void,
  ): Promise<EmployerJobDto> {
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

    change(job);
    await this.jobs.update(job);
    const applications = await this.applications.getByJobId(job.id);

    return toEmployerJob(job, applications.length);
  }
}

const toEmployerJob = (job: Job, applications: number): EmployerJobDto => ({
  id: job.id,
  title: job.title,
  status: job.status,
  applications,
  deadline: job.deadline,
  postedAt: job.postedAt,
});
