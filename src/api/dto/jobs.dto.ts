import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { JobLevel, JobStatus, WorkMode } from '../../domain';
import { JobSortOrder } from '../../application/jobs/dto';

const toArray = ({ value }: { value: unknown }) =>
  value === undefined ? undefined : Array.isArray(value) ? value : [value];

export class CreateJobDto {
  @IsString() @IsNotEmpty() title!: string;
  @IsString() location!: string;
  @IsNumber() salaryMin!: number;
  @IsNumber() salaryMax!: number;
  /** Hạn nộp hồ sơ (ISO 8601), phải ở tương lai. */
  @Type(() => Date) @IsDate() deadline!: Date;
  @IsEnum(JobLevel) level!: JobLevel;
  @IsEnum(WorkMode) workMode!: WorkMode;
  @IsString() category!: string;
  @IsString() summary!: string;
  @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) skills!: string[];
}

export class SearchJobsQueryDto {
  /** Tìm trong tiêu đề, tên công ty và kỹ năng. */
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsEnum(JobLevel) level?: JobLevel;
  /** Chỉ lấy tin có mức lương tối thiểu từ giá trị này. */
  @IsOptional() @Type(() => Number) @IsNumber() minimumSalary?: number;
  /** Lặp lại tham số để lọc nhiều kỹ năng (phải có đủ tất cả). */
  @IsOptional()
  @Transform(toArray)
  @IsString({ each: true })
  skills?: string[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
  @IsOptional() @IsEnum(JobSortOrder) sort?: JobSortOrder = JobSortOrder.Newest;
}

export class JobSummaryResponseDto {
  id!: number;
  title!: string;
  companyId!: number;
  company!: string;
  location!: string;
  salaryMin!: number;
  salaryMax!: number;
  level!: JobLevel;
  workMode!: WorkMode;
  category!: string;
  deadline!: Date;
  postedAt!: Date;
  featured!: boolean;
  skills!: string[];
}

export class JobDetailResponseDto extends JobSummaryResponseDto {
  summary!: string;
  description!: string[];
  requirements!: string[];
  benefits!: string[];
}

export class PagedJobsResponseDto {
  items!: JobSummaryResponseDto[];
  page!: number;
  pageSize!: number;
  totalItems!: number;
  totalPages!: number;
}

export class EmployerJobResponseDto {
  id!: number;
  title!: string;
  status!: JobStatus;
  /** Số đơn ứng tuyển đã nhận. */
  applications!: number;
  deadline!: Date;
  postedAt!: Date;
}
