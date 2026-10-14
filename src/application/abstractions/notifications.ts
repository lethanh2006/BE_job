import { Company, Job, JobApplication } from '../../domain';
import { Page } from './admin';

export type NotificationType =
  | 'ApplicationReceived'
  | 'ApplicationStatusChanged'
  | 'JobMatch'
  | 'JobTakenDown'
  | 'JobReinstated'
  | 'CompanySuspended'
  | 'CompanyReactivated';

export interface Notification {
  id: number;
  userId: number;
  type: NotificationType;
  title: string;
  body: string;
  /** Đường dẫn trong ứng dụng để mở khi người dùng bấm vào thông báo. */
  link: string | null;
  createdAt: Date;
  readAt: Date | null;
}

export type NewNotification = Omit<Notification, 'id' | 'readAt'>;

export abstract class NotificationRepository {
  abstract addMany(notifications: NewNotification[]): Promise<void>;
  /** Mới nhất trước. */
  abstract list(
    userId: number,
    options: { unreadOnly: boolean; page: number; pageSize: number },
  ): Promise<Page<Notification>>;
  abstract countUnread(userId: number): Promise<number>;
  /** Đánh dấu đã đọc (lặp lại không sao); false nếu thông báo không tồn tại hoặc của người khác. */
  abstract markRead(userId: number, id: number, readAt: Date): Promise<boolean>;
  abstract markAllRead(userId: number, readAt: Date): Promise<void>;
}

/**
 * Cổng phát thông báo cho các sự kiện nghiệp vụ. Các use case chỉ biết cổng này, nên có thể thay
 * bằng bản giả khi test và thêm kênh khác (email, đẩy) mà không sửa use case. Mọi phương thức
 * đều "cố gắng hết sức": lỗi gửi thông báo không làm hỏng thao tác chính.
 */
export abstract class ApplicationNotifier {
  abstract applicationReceived(
    job: Job,
    application: JobApplication,
  ): Promise<void>;
  abstract applicationStatusChanged(
    job: Job,
    application: JobApplication,
  ): Promise<void>;
  abstract jobPublished(job: Job): Promise<void>;
  abstract jobTakenDown(job: Job): Promise<void>;
  abstract jobReinstated(job: Job): Promise<void>;
  abstract companySuspended(company: Company): Promise<void>;
  abstract companyReactivated(company: Company): Promise<void>;
}
