import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CompanyStatus, JobStatus } from '../../domain';
import { AccountRole } from '../../application/auth';
import {
  AuditAction,
  AuditTargetType,
} from '../../application/abstractions/admin';

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

class PagingQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}

export class AdminJobsQueryDto extends PagingQueryDto {
  /** Tìm trong tiêu đề, tên công ty và kỹ năng (không phân biệt dấu). */
  @IsOptional() @IsString() @MaxLength(200) keyword?: string;
  @IsOptional() @IsEnum(JobStatus) status?: JobStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) companyId?: number;
}

export class AdminCompaniesQueryDto extends PagingQueryDto {
  @IsOptional() @IsString() @MaxLength(200) keyword?: string;
  @IsOptional() @IsEnum(CompanyStatus) status?: CompanyStatus;
}

export class AdminUsersQueryDto extends PagingQueryDto {
  /** Tìm trong tên và email. */
  @IsOptional() @IsString() @MaxLength(200) keyword?: string;
  @IsOptional() @IsEnum(AccountRole) role?: AccountRole;
  @IsOptional() @Transform(toBoolean) @IsBoolean() disabled?: boolean;
}

export class AuditLogsQueryDto extends PagingQueryDto {}

export class ModerationReasonDto {
  /** Lý do được gửi tới nhà tuyển dụng và lưu trong nhật ký. */
  @IsString() @IsNotEmpty() @MaxLength(500) reason!: string;
}

export class AdminStatsResponseDto {
  users!: { candidates: number; employers: number; admins: number };
  companies!: { active: number; suspended: number };
  jobs!: { draft: number; published: number; closed: number; removed: number };
  applications!: number;
}

export class AdminJobResponseDto {
  id!: number;
  title!: string;
  companyId!: number;
  company!: string;
  status!: JobStatus;
  removalReason!: string | null;
  applications!: number;
  postedAt!: Date;
  deadline!: Date;
}

export class AdminCompanyResponseDto {
  id!: number;
  name!: string;
  location!: string | null;
  status!: CompanyStatus;
  suspensionReason!: string | null;
  /** Tổng số tin (mọi trạng thái). */
  jobs!: number;
  /** Số tài khoản nhà tuyển dụng của công ty. */
  members!: number;
}

export class AdminUserResponseDto {
  id!: number;
  name!: string;
  email!: string;
  role!: AccountRole;
  companyId!: number | null;
  companyName!: string | null;
  disabled!: boolean;
}

export class AuditEntryResponseDto {
  id!: number;
  actorId!: number;
  actorName!: string;
  action!: AuditAction;
  targetType!: AuditTargetType;
  targetId!: number;
  detail!: string | null;
  createdAt!: Date;
}

class PagedResponseDto {
  page!: number;
  pageSize!: number;
  totalItems!: number;
  totalPages!: number;
}

export class PagedAdminJobsResponseDto extends PagedResponseDto {
  items!: AdminJobResponseDto[];
}

export class PagedAdminCompaniesResponseDto extends PagedResponseDto {
  items!: AdminCompanyResponseDto[];
}

export class PagedAdminUsersResponseDto extends PagedResponseDto {
  items!: AdminUserResponseDto[];
}

export class PagedAuditLogsResponseDto extends PagedResponseDto {
  items!: AuditEntryResponseDto[];
}

export class JobModerationResponseDto {
  id!: number;
  status!: JobStatus;
  removalReason!: string | null;
}

export class CompanyModerationResponseDto {
  id!: number;
  status!: CompanyStatus;
  suspensionReason!: string | null;
}

export class UserModerationResponseDto {
  id!: number;
  disabled!: boolean;
}
