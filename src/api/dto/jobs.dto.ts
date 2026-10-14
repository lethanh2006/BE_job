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
  MaxLength,
  Min,
} from 'class-validator';
import { JobLevel, JobStatus, WorkMode } from '../../domain';
import { JobSortOrder } from '../../application/jobs/dto';

const toArray = ({ value }: { value: unknown }) =>
  value === undefined ? undefined : Array.isArray(value) ? value : [value];

/** Nội dung tin tuyển dụng; dùng cho cả tạo mới (POST) và thay thế toàn bộ (PUT). */
export class CreateJobDto {
  @IsString() @IsNotEmpty() @MaxLength(200) title!: string;
  @IsString() @MaxLength(200) location!: string;
  @IsNumber() @Min(0) @Max(1_000_000_000) salaryMin!: number;
  @IsNumber() @Min(0) @Max(1_000_000_000) salaryMax!: number;
  /** Hạn nộp hồ sơ (ISO 8601), phải ở tương lai. */
  @Type(() => Date) @IsDate() deadline!: Date;
  @IsEnum(JobLevel) level!: JobLevel;
  @IsEnum(WorkMode) workMode!: WorkMode;
  @IsString() @MaxLength(120) category!: string;
  @IsString() @MaxLength(2000) summary!: string;
  /** Mỗi phần tử là một ý/dòng mô tả công việc. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  description?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  requirements?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(1000, { each: true })
  benefits?: string[];
  /** Tối đa 15 kỹ năng, không phân biệt hoa thường. */
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  skills!: string[];
}

export class SearchJobsQueryDto {
  /** Tìm trong tiêu đề, tên công ty và kỹ năng. */
  @IsOptional() @IsString() @MaxLength(200) keyword?: string;
  @IsOptional() @IsString() @MaxLength(200) location?: string;
  @IsOptional() @IsString() @MaxLength(120) category?: string;
  @IsOptional() @IsEnum(JobLevel) level?: JobLevel;
  /** Chỉ lấy tin có mức lương tối thiểu từ giá trị này. */
  @IsOptional() @Type(() => Number) @IsNumber() minimumSalary?: number;
  /** Lặp lại tham số để lọc nhiều kỹ năng (phải có đủ tất cả). */
  @IsOptional()
  @Transform(toArray)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
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
  /** Published (đang tuyển) hoặc Closed (đã đóng, chỉ còn để xem lại). */
  status!: JobStatus;
  /** Đã quá hạn nộp hồ sơ. */
  expired!: boolean;
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

/** Toàn bộ nội dung tin dưới góc nhìn nhà tuyển dụng (kể cả bản nháp). */
export class EmployerJobDetailResponseDto extends EmployerJobResponseDto {
  location!: string;
  salaryMin!: number;
  salaryMax!: number;
  level!: JobLevel;
  workMode!: WorkMode;
  category!: string;
  summary!: string;
  description!: string[];
  requirements!: string[];
  benefits!: string[];
  skills!: string[];
  featured!: boolean;
}
