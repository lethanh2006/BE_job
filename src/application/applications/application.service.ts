import { ApplicationNotifier } from '../abstractions/notifications';
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
    private readonly notifier: ApplicationNotifier,
  ) {}

  async apply(candidateId: number, jobId: number): Promise<JobApplication> {
    const job = await this.jobs.getById(jobId);
    if (!job) {
      throw new ResourceNotFoundException(
        `Không tìm thấy tin tuyển dụng có mã ${jobId}.`,
      );
    }
    if (
      job.status !== JobStatus.Published ||
      !job.isPubliclyVisible ||
      job.isExpired
    ) {
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
    await this.notifier.applicationReceived(job, application);

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

    const previousStatus = application.status;
    application.changeStatus(status, manager, job);
    await this.applications.update(application);
    if (application.status !== previousStatus) {
      await this.notifier.applicationStatusChanged(job, application);
    }

    return application;
  }
}
