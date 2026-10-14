import { Injectable, Logger } from '@nestjs/common';
import {
  ApplicationStatus,
  Clock,
  Company,
  Job,
  JobApplication,
} from '../../domain';
import {
  ApplicationNotifier,
  NewNotification,
  Notification,
  NotificationRepository,
  NotificationType,
} from '../abstractions/notifications';
import { UserAccountRepository } from '../abstractions/authentication';
import { CandidateRepository } from '../abstractions/persistence';
import { PagedResult } from '../common/paged-result';
import { ArgumentError } from '../../domain';
import { ResourceNotFoundException } from '../exceptions';
import { JobMatchService } from '../matching/job-match.service';

/** Điểm phù hợp tối thiểu để ứng viên nhận thông báo khi có tin mới. */
export const JOB_MATCH_NOTIFICATION_THRESHOLD = 70;
/** Giới hạn số ứng viên được báo cho mỗi tin để một lần đăng tin không tạo hàng nghìn bản ghi. */
export const JOB_MATCH_MAX_RECIPIENTS = 100;

const statusLabels: Record<ApplicationStatus, string> = {
  [ApplicationStatus.Submitted]: 'đã nộp',
  [ApplicationStatus.Reviewing]: 'đang được xem xét',
  [ApplicationStatus.Accepted]: 'được chấp nhận',
  [ApplicationStatus.Rejected]: 'chưa phù hợp',
};

export interface NotificationDto {
  id: number;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  createdAt: Date;
  read: boolean;
}

@Injectable()
export class NotificationService extends ApplicationNotifier {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly notifications: NotificationRepository,
    private readonly accounts: UserAccountRepository,
    private readonly candidates: CandidateRepository,
    private readonly matching: JobMatchService,
    private readonly clock: Clock,
  ) {
    super();
  }

  // --- Phía đọc (người dùng xem thông báo của mình) ---

  async list(
    userId: number,
    query: { unreadOnly?: boolean; page?: number; pageSize?: number },
  ): Promise<PagedResult<NotificationDto>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    if (!Number.isSafeInteger(page) || page < 1)
      throw new ArgumentError('Số trang phải lớn hơn 0.');
    if (!Number.isSafeInteger(pageSize) || !(pageSize > 0 && pageSize <= 100)) {
      throw new ArgumentError('Kích thước trang phải từ 1 đến 100.');
    }

    const { items, total } = await this.notifications.list(userId, {
      unreadOnly: query.unreadOnly ?? false,
      page,
      pageSize,
    });

    return new PagedResult(items.map(toDto), page, pageSize, total);
  }

  countUnread(userId: number): Promise<number> {
    return this.notifications.countUnread(userId);
  }

  async markRead(userId: number, id: number): Promise<void> {
    if (!(await this.notifications.markRead(userId, id, this.clock.utcNow))) {
      throw new ResourceNotFoundException(
        `Không tìm thấy thông báo có mã ${id}.`,
      );
    }
  }

  markAllRead(userId: number): Promise<void> {
    return this.notifications.markAllRead(userId, this.clock.utcNow);
  }

  // --- Phía phát (các sự kiện nghiệp vụ) ---

  applicationReceived(job: Job, application: JobApplication): Promise<void> {
    return this.safely('applicationReceived', async () => {
      const candidate = await this.candidates.getById(application.candidateId);
      const candidateName =
        candidate?.name ?? `Ứng viên #${application.candidateId}`;
      await this.sendToEmployers(job.companyId, {
        type: 'ApplicationReceived',
        title: 'Có đơn ứng tuyển mới',
        body: `${candidateName} vừa ứng tuyển vị trí “${job.title}”.`,
        link: `/nha-tuyen-dung?tab=candidates&application=${application.id}`,
      });
    });
  }

  applicationStatusChanged(
    job: Job,
    application: JobApplication,
  ): Promise<void> {
    return this.safely('applicationStatusChanged', () =>
      this.send([application.candidateId], {
        type: 'ApplicationStatusChanged',
        title: 'Đơn ứng tuyển được cập nhật',
        body: `Đơn ứng tuyển “${job.title}” tại ${job.company?.name ?? 'công ty'} ${statusLabels[application.status]}.`,
        link: '/ung-vien/don-ung-tuyen',
      }),
    );
  }

  jobPublished(job: Job): Promise<void> {
    return this.safely('jobPublished', async () => {
      if (job.skills.length === 0) return;

      const candidates = await this.candidates.findBySkills(
        job.skills.map((skill) => skill.name),
        JOB_MATCH_MAX_RECIPIENTS * 3,
      );
      const matched = candidates
        .map((candidate) => ({
          candidate,
          score: this.matching.score(job, candidate),
        }))
        .filter(({ score }) => score >= JOB_MATCH_NOTIFICATION_THRESHOLD)
        .sort((a, b) => b.score - a.score || a.candidate.id - b.candidate.id)
        .slice(0, JOB_MATCH_MAX_RECIPIENTS);

      await this.notifications.addMany(
        matched.map(({ candidate, score }) =>
          this.build(candidate.id, {
            type: 'JobMatch',
            title: 'Việc làm phù hợp với bạn',
            body: `“${job.title}” tại ${job.company?.name ?? 'công ty'} khớp ${score}% với hồ sơ của bạn.`,
            link: `/viec-lam/${job.id}`,
          }),
        ),
      );
    });
  }

  jobTakenDown(job: Job): Promise<void> {
    return this.safely('jobTakenDown', () =>
      this.sendToEmployers(job.companyId, {
        type: 'JobTakenDown',
        title: 'Tin tuyển dụng bị gỡ',
        body: `Tin “${job.title}” đã bị gỡ: ${job.removalReason ?? 'vi phạm điều khoản'}.`,
        link: '/nha-tuyen-dung',
      }),
    );
  }

  jobReinstated(job: Job): Promise<void> {
    return this.safely('jobReinstated', () =>
      this.sendToEmployers(job.companyId, {
        type: 'JobReinstated',
        title: 'Tin tuyển dụng được khôi phục',
        body: `Tin “${job.title}” đã trở về bản nháp. Bạn có thể xem lại và đăng lại.`,
        link: '/nha-tuyen-dung',
      }),
    );
  }

  companySuspended(company: Company): Promise<void> {
    return this.safely('companySuspended', () =>
      this.sendToEmployers(company.id, {
        type: 'CompanySuspended',
        title: 'Công ty bị khóa',
        body: `Công ty ${company.name} đã bị khóa: ${company.suspensionReason ?? 'vi phạm điều khoản'}. Các tin tuyển dụng tạm thời bị ẩn.`,
        link: '/nha-tuyen-dung/cong-ty',
      }),
    );
  }

  companyReactivated(company: Company): Promise<void> {
    return this.safely('companyReactivated', () =>
      this.sendToEmployers(company.id, {
        type: 'CompanyReactivated',
        title: 'Công ty được mở khóa',
        body: `Công ty ${company.name} đã hoạt động trở lại.`,
        link: '/nha-tuyen-dung',
      }),
    );
  }

  // --- Nội bộ ---

  private async sendToEmployers(
    companyId: number,
    content: Pick<NewNotification, 'type' | 'title' | 'body' | 'link'>,
  ) {
    return this.send(await this.accounts.findEmployerIds(companyId), content);
  }

  private async send(
    userIds: number[],
    content: Pick<NewNotification, 'type' | 'title' | 'body' | 'link'>,
  ) {
    await this.notifications.addMany(
      userIds.map((userId) => this.build(userId, content)),
    );
  }

  private build(
    userId: number,
    content: Pick<NewNotification, 'type' | 'title' | 'body' | 'link'>,
  ): NewNotification {
    return { userId, ...content, createdAt: this.clock.utcNow };
  }

  /** Thông báo chỉ là phần phụ: lỗi được ghi log chứ không làm hỏng thao tác nghiệp vụ gọi nó. */
  private async safely(event: string, work: () => Promise<void>) {
    try {
      await work();
    } catch (error) {
      this.logger.error(
        `Không thể phát thông báo cho sự kiện ${event}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}

const toDto = (notification: Notification): NotificationDto => ({
  id: notification.id,
  type: notification.type,
  title: notification.title,
  body: notification.body,
  link: notification.link,
  createdAt: notification.createdAt,
  read: notification.readAt !== null,
});
