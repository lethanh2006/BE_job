import { CompanyStatus, JobStatus } from '../../domain';
import { AccountRole } from '../auth';

export interface Page<T> {
  items: T[];
  /** Tổng số dòng khớp điều kiện (không phụ thuộc phân trang). */
  total: number;
}

interface PagingCriteria {
  page: number;
  pageSize: number;
}

export interface AdminJobCriteria extends PagingCriteria {
  /** Đã `foldText`; tìm trong tiêu đề, tên công ty và kỹ năng như tìm kiếm công khai. */
  keyword?: string;
  status?: JobStatus;
  companyId?: number;
}

export interface AdminCompanyCriteria extends PagingCriteria {
  /** Đã `foldText`; tìm trong tên công ty. */
  keyword?: string;
  status?: CompanyStatus;
}

export interface AdminUserCriteria extends PagingCriteria {
  /** Đã `foldText`; tìm trong tên và email. */
  keyword?: string;
  role?: AccountRole;
  disabled?: boolean;
}

export interface AdminJobRow {
  id: number;
  title: string;
  companyId: number;
  company: string;
  status: JobStatus;
  removalReason: string | null;
  applications: number;
  postedAt: Date;
  deadline: Date;
}

export interface AdminCompanyRow {
  id: number;
  name: string;
  location: string | null;
  status: CompanyStatus;
  suspensionReason: string | null;
  /** Tổng số tin (mọi trạng thái). */
  jobs: number;
  /** Số tài khoản nhà tuyển dụng của công ty. */
  members: number;
}

export interface AdminUserRow {
  id: number;
  name: string;
  email: string;
  role: AccountRole;
  companyId: number | null;
  companyName: string | null;
  disabled: boolean;
}

export interface AdminStats {
  users: { candidates: number; employers: number; admins: number };
  companies: { active: number; suspended: number };
  jobs: { draft: number; published: number; closed: number; removed: number };
  applications: number;
}

/** Phía đọc cho các màn hình quản trị: lọc, đếm và phân trang ở nơi lưu trữ. */
export abstract class AdminReader {
  abstract stats(): Promise<AdminStats>;
  abstract searchJobs(criteria: AdminJobCriteria): Promise<Page<AdminJobRow>>;
  abstract searchCompanies(
    criteria: AdminCompanyCriteria,
  ): Promise<Page<AdminCompanyRow>>;
  abstract searchUsers(
    criteria: AdminUserCriteria,
  ): Promise<Page<AdminUserRow>>;
}

export type AuditAction =
  | 'JobTakenDown'
  | 'JobReinstated'
  | 'CompanySuspended'
  | 'CompanyReactivated'
  | 'UserDisabled'
  | 'UserEnabled';

export type AuditTargetType = 'Job' | 'Company' | 'User';

export interface AuditEntry {
  id: number;
  actorId: number;
  actorName: string;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: number;
  /** Lý do hoặc ghi chú đi kèm thao tác. */
  detail: string | null;
  createdAt: Date;
}

export abstract class AuditLogRepository {
  abstract add(entry: Omit<AuditEntry, 'id'>): Promise<void>;
  /** Mới nhất trước. */
  abstract list(page: number, pageSize: number): Promise<Page<AuditEntry>>;
}
