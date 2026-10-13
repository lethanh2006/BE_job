import { Injectable } from '@nestjs/common';
import {
  AlreadyAppliedException,
  ApplicationStatus,
  Clock,
  JobApplication,
  JobClosedException,
  JobStatus,
  User,
} from '../../domain';
import {
  JobApplicationRepository,
  JobRepository,
} from '../abstractions/persistence';
import { ResourceNotFoundException } from '../exceptions';

@Injectable()
export class ApplicationService {
  constructor(
    private readonly jobs: JobRepository,
    private readonly applications: JobApplicationRepository,
    private readonly clock: Clock,
  ) {}

  async apply(candidateId: number, jobId: number): Promise<JobApplication> {
    const job = await this.jobs.getById(jobId);
    if (!job) {
      throw new ResourceNotFoundException(
        `Không tìm thấy tin tuyển dụng có mã ${jobId}.`,
      );
    }
    if (job.status !== JobStatus.Published || job.isExpired) {
      throw new JobClosedException(
        'Tin tuyển dụng đã đóng hoặc hết hạn nhận hồ sơ.',
      );
    }
    if (await this.applications.hasApplied(candidateId, jobId)) {
      throw new AlreadyAppliedException(
        'Ứng viên đã ứng tuyển vào tin tuyển dụng này.',
      );
    }

    const application = new JobApplication(
      await this.applications.getNextId(),
      job.id,
      candidateId,
      this.clock.utcNow,
    );
    await this.applications.add(application);

    return application;
  }

  async changeStatus(
    applicationId: number,
    status: ApplicationStatus,
    manager: User,
  ): Promise<JobApplication> {
    const application = await this.applications.getById(applicationId);
    if (!application) {
      throw new ResourceNotFoundException(
        `Không tìm thấy đơn ứng tuyển có mã ${applicationId}.`,
      );
    }
    const job = await this.jobs.getById(application.jobId);
    if (!job) {
      throw new ResourceNotFoundException(
        `Không tìm thấy tin tuyển dụng có mã ${application.jobId}.`,
      );
    }

    application.changeStatus(status, manager, job);
    await this.applications.update(application);

    return application;
  }
}
