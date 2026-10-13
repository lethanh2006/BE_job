import { ArgumentError, JobManagementForbiddenException } from '../exceptions';
import { ApplicationStatus, isEnumValue } from './enums';
import type { Job } from './job';
import type { User } from './user';

export class JobApplication {
  private currentStatus: ApplicationStatus;

  constructor(
    readonly id: number,
    readonly jobId: number,
    readonly candidateId: number,
    readonly appliedAt: Date,
    status: ApplicationStatus = ApplicationStatus.Submitted,
  ) {
    if (!(jobId > 0)) throw new ArgumentError('JobId phải lớn hơn 0.');
    if (!(candidateId > 0)) {
      throw new ArgumentError('CandidateId phải lớn hơn 0.');
    }
    if (!isEnumValue(ApplicationStatus, status)) {
      throw new ArgumentError('Trạng thái đơn ứng tuyển không hợp lệ.');
    }
    this.currentStatus = status;
  }

  get status(): ApplicationStatus {
    return this.currentStatus;
  }

  changeStatus(status: ApplicationStatus, manager: User, job: Job): void {
    if (job.id !== this.jobId) {
      throw new ArgumentError('Tin tuyển dụng không thuộc đơn ứng tuyển này.');
    }
    if (!manager.canManage(job)) {
      throw new JobManagementForbiddenException(
        'Người dùng không có quyền cập nhật đơn ứng tuyển của tin này.',
      );
    }
    if (!isEnumValue(ApplicationStatus, status)) {
      throw new ArgumentError('Trạng thái đơn ứng tuyển không hợp lệ.');
    }
    this.currentStatus = status;
  }

  /** Dạng JSON trả về cho client (khớp contract của backend C#). */
  toJSON() {
    return {
      id: this.id,
      jobId: this.jobId,
      candidateId: this.candidateId,
      status: this.currentStatus,
      appliedAt: this.appliedAt,
    };
  }
}
