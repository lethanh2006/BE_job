import { ApplicationNotifier } from '../abstractions/notifications';
import { Injectable } from '@nestjs/common';
import { ArgumentError, Clock } from '../../domain';
import {
  AuditAction,
  AuditLogRepository,
  AuditTargetType,
} from '../abstractions/admin';
import {
  AccountSecurityRepository,
  RefreshTokenRepository,
  UserAccountRepository,
} from '../abstractions/authentication';
import { CompanyRepository, JobRepository } from '../abstractions/persistence';
import { AccountRole } from '../auth';
import { ResourceNotFoundException } from '../exceptions';
import {
  AdminActor,
  CompanyModerationResult,
  JobModerationResult,
  UserModerationResult,
} from './dto';

/** Thao tác kiểm duyệt của quản trị viên; mỗi thao tác đều được ghi nhật ký. */
@Injectable()
export class AdminModerationService {
  constructor(
    private readonly jobs: JobRepository,
    private readonly companies: CompanyRepository,
    private readonly accounts: UserAccountRepository,
    private readonly accountSecurity: AccountSecurityRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly audit: AuditLogRepository,
    private readonly clock: Clock,
    private readonly notifier: ApplicationNotifier,
  ) {}

  async takeDownJob(
    actor: AdminActor,
    jobId: number,
    reason: string,
  ): Promise<JobModerationResult> {
    const job = await this.getJob(jobId);

    job.takeDown(reason);
    await this.jobs.update(job);
    await this.record(actor, 'JobTakenDown', 'Job', jobId, job.removalReason);
    await this.notifier.jobTakenDown(job);

    return toJobResult(job);
  }

  async reinstateJob(
    actor: AdminActor,
    jobId: number,
  ): Promise<JobModerationResult> {
    const job = await this.getJob(jobId);

    job.reinstate();
    await this.jobs.update(job);
    await this.record(actor, 'JobReinstated', 'Job', jobId, null);
    await this.notifier.jobReinstated(job);

    return toJobResult(job);
  }

  async suspendCompany(
    actor: AdminActor,
    companyId: number,
    reason: string,
  ): Promise<CompanyModerationResult> {
    const company = await this.getCompany(companyId);

    company.suspend(reason);
    await this.companies.update(company);
    // Tin của công ty bị ẩn khỏi tìm kiếm ngay khi bản chụp công ty trong tin được làm mới.
    await this.jobs.updateCompanySnapshot(company);
    await this.record(
      actor,
      'CompanySuspended',
      'Company',
      companyId,
      company.suspensionReason ?? null,
    );
    await this.notifier.companySuspended(company);

    return toCompanyResult(company);
  }

  async reactivateCompany(
    actor: AdminActor,
    companyId: number,
  ): Promise<CompanyModerationResult> {
    const company = await this.getCompany(companyId);

    company.reactivate();
    await this.companies.update(company);
    await this.jobs.updateCompanySnapshot(company);
    await this.record(actor, 'CompanyReactivated', 'Company', companyId, null);
    await this.notifier.companyReactivated(company);

    return toCompanyResult(company);
  }

  async disableUser(
    actor: AdminActor,
    userId: number,
  ): Promise<UserModerationResult> {
    const account = await this.accounts.findById(userId);
    if (!account) throw userNotFound(userId);
    if (account.id === actor.id) {
      throw new ArgumentError('Không thể khóa chính tài khoản của bạn.');
    }
    if (account.role === AccountRole.Admin) {
      throw new ArgumentError('Không thể khóa tài khoản quản trị viên.');
    }

    await this.accountSecurity.setDisabled(userId, true);
    // Đăng xuất mọi thiết bị: refresh token không còn dùng được ngay lập tức.
    await this.refreshTokens.revokeByUser(userId, this.clock.utcNow);
    await this.record(actor, 'UserDisabled', 'User', userId, null);

    return { id: userId, disabled: true };
  }

  async enableUser(
    actor: AdminActor,
    userId: number,
  ): Promise<UserModerationResult> {
    if (!(await this.accountSecurity.setDisabled(userId, false))) {
      throw userNotFound(userId);
    }
    await this.record(actor, 'UserEnabled', 'User', userId, null);

    return { id: userId, disabled: false };
  }

  private async getJob(jobId: number) {
    const job = await this.jobs.getById(jobId);
    if (!job) {
      throw new ResourceNotFoundException(
        `Không tìm thấy tin tuyển dụng có mã ${jobId}.`,
      );
    }
    return job;
  }

  private async getCompany(companyId: number) {
    const company = await this.companies.getById(companyId);
    if (!company) {
      throw new ResourceNotFoundException(
        `Không tìm thấy công ty có mã ${companyId}.`,
      );
    }
    return company;
  }

  private record(
    actor: AdminActor,
    action: AuditAction,
    targetType: AuditTargetType,
    targetId: number,
    detail: string | null | undefined,
  ) {
    return this.audit.add({
      actorId: actor.id,
      actorName: actor.name,
      action,
      targetType,
      targetId,
      detail: detail ?? null,
      createdAt: this.clock.utcNow,
    });
  }
}

const userNotFound = (userId: number) =>
  new ResourceNotFoundException(`Không tìm thấy tài khoản có mã ${userId}.`);

const toJobResult = (job: {
  id: number;
  status: JobModerationResult['status'];
  removalReason?: string;
}): JobModerationResult => ({
  id: job.id,
  status: job.status,
  removalReason: job.removalReason ?? null,
});

const toCompanyResult = (company: {
  id: number;
  status: CompanyModerationResult['status'];
  suspensionReason?: string;
}): CompanyModerationResult => ({
  id: company.id,
  status: company.status,
  suspensionReason: company.suspensionReason ?? null,
});
