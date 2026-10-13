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
import { ApplicationStatus, JobLevel, WorkMode } from '../../domain';
import { JobSortOrder } from '../../application/jobs/dto';

const toArray = ({ value }: { value: unknown }) =>
  value === undefined ? undefined : Array.isArray(value) ? value : [value];

export class LoginDto {
  @IsString() email!: string;
  @IsString() password!: string;
}

export class RegisterCandidateDto {
  @IsString() name!: string;
  @IsString() email!: string;
  @IsString() password!: string;
}

export class RefreshTokenDto {
  @IsString() refreshToken!: string;
}

export class ChangePasswordDto {
  @IsString() currentPassword!: string;
  @IsString() newPassword!: string;
}

export class ApplyDto {
  @IsInt() jobId!: number;
}

export class ChangeApplicationStatusDto {
  @IsEnum(ApplicationStatus) status!: ApplicationStatus;
}

export class UpdateCandidateProfileDto {
  @IsString() email!: string;
  @IsOptional() @IsString() bio?: string | null;
  @IsOptional() @IsNumber() desiredSalaryMin?: number | null;
  @IsOptional() @IsNumber() desiredSalaryMax?: number | null;
  @IsArray() @IsString({ each: true }) skills!: string[];
}

export class CreateJobDto {
  @IsString() @IsNotEmpty() title!: string;
  @IsString() location!: string;
  @IsNumber() salaryMin!: number;
  @IsNumber() salaryMax!: number;
  @Type(() => Date) @IsDate() deadline!: Date;
  @IsEnum(JobLevel) level!: JobLevel;
  @IsEnum(WorkMode) workMode!: WorkMode;
  @IsString() category!: string;
  @IsString() summary!: string;
  @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) skills!: string[];
}

export class SearchJobsQueryDto {
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsEnum(JobLevel) level?: JobLevel;
  @IsOptional() @Type(() => Number) @IsNumber() minimumSalary?: number;
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
