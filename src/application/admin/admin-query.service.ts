import { Injectable } from '@nestjs/common';
import { ArgumentError, CompanyStatus, JobStatus } from '../../domain';
import {
  AdminCompanyRow,
  AdminJobRow,
  AdminReader,
  AdminStats,
  AdminUserRow,
  AuditEntry,
  AuditLogRepository,
} from '../abstractions/admin';
import { AccountRole } from '../auth';
import { PagedResult } from '../common/paged-result';
import { foldText, stripControlCharacters } from '../common/text-folding';

interface PagingQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

export interface AdminJobsQuery extends PagingQuery {
  status?: JobStatus;
  companyId?: number;
}

export interface AdminCompaniesQuery extends PagingQuery {
  status?: CompanyStatus;
}

export interface AdminUsersQuery extends PagingQuery {
  role?: AccountRole;
  disabled?: boolean;
}

/** Các màn hình đọc dành cho quản trị viên (danh sách, thống kê, nhật ký). */
@Injectable()
export class AdminQueryService {
  constructor(
    private readonly reader: AdminReader,
    private readonly audit: AuditLogRepository,
  ) {}

  stats(): Promise<AdminStats> {
    return this.reader.stats();
  }

  async jobs(query: AdminJobsQuery): Promise<PagedResult<AdminJobRow>> {
    const { page, pageSize } = paging(query);
    const { items, total } = await this.reader.searchJobs({
      keyword: keyword(query.keyword),
      status: query.status,
      companyId: query.companyId,
      page,
      pageSize,
    });

    return new PagedResult(items, page, pageSize, total);
  }

  async companies(
    query: AdminCompaniesQuery,
  ): Promise<PagedResult<AdminCompanyRow>> {
    const { page, pageSize } = paging(query);
    const { items, total } = await this.reader.searchCompanies({
      keyword: keyword(query.keyword),
      status: query.status,
      page,
      pageSize,
    });

    return new PagedResult(items, page, pageSize, total);
  }

  async users(query: AdminUsersQuery): Promise<PagedResult<AdminUserRow>> {
    const { page, pageSize } = paging(query);
    const { items, total } = await this.reader.searchUsers({
      keyword: keyword(query.keyword),
      role: query.role,
      disabled: query.disabled,
      page,
      pageSize,
    });

    return new PagedResult(items, page, pageSize, total);
  }

  async auditLogs(query: PagingQuery): Promise<PagedResult<AuditEntry>> {
    const { page, pageSize } = paging(query);
    const { items, total } = await this.audit.list(page, pageSize);

    return new PagedResult(items, page, pageSize, total);
  }
}

function paging(query: PagingQuery) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  if (!(page > 0)) throw new ArgumentError('Số trang phải lớn hơn 0.');
  if (!(pageSize > 0 && pageSize <= 100)) {
    throw new ArgumentError('Kích thước trang phải từ 1 đến 100.');
  }

  return { page, pageSize };
}

const keyword = (value?: string): string | undefined =>
  foldText(stripControlCharacters(value ?? '')).trim() || undefined;
