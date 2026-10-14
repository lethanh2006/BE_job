import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { JobSummaryResponseDto } from './jobs.dto';

export class UpdateCandidateProfileDto {
  @IsString() @MaxLength(320) email!: string;
  @IsOptional() @IsString() @MaxLength(4000) bio?: string | null;
  /** Phải đi cùng `desiredSalaryMax`; bỏ trống cả hai để xóa khoảng lương. */
  @IsOptional() @IsNumber() @Min(0) @Max(1_000_000_000) desiredSalaryMin?:
    number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(1_000_000_000) desiredSalaryMax?:
    number | null;
  /** Tối đa 30 kỹ năng, không phân biệt hoa thường. */
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  skills!: string[];
}

export class CandidateProfileResponseDto {
  id!: number;
  name!: string;
  email!: string;
  bio!: string | null;
  desiredSalaryMin!: number | null;
  desiredSalaryMax!: number | null;
  skills!: string[];
}

/** Nhận `jobIds=1,2,3` hoặc lặp lại tham số `jobIds=1&jobIds=2`. */
const toIntegerList = ({ value }: { value: unknown }): unknown => {
  if (value === undefined) return undefined;
  const parts = (Array.isArray(value) ? value : [value]).flatMap((item) =>
    String(item).split(','),
  );
  return parts.filter((part) => part.trim() !== '').map(Number);
};

export class JobMatchesQueryDto {
  /** Mã các tin cần chấm điểm (tối đa 50). */
  @Transform(toIntegerList)
  @IsArray()
  @ArrayMaxSize(50)
  @IsInt({ each: true })
  @Min(1, { each: true })
  jobIds!: number[];
}

export class RecommendedJobsQueryDto {
  /** Số tin tối đa trả về (1–20, mặc định 6). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number = 6;
}

export class JobMatchResponseDto {
  jobId!: number;
  /** Độ phù hợp 0–100 (70% kỹ năng, 30% mức lương). */
  score!: number;
  matchedSkills!: string[];
  missingSkills!: string[];
  salaryFit!: boolean;
}

export class RecommendedJobResponseDto extends JobSummaryResponseDto {
  matchScore!: number;
}

/** Thông tin CV (không gồm nội dung); tải nội dung qua endpoint tải về riêng. */
export class CvInfoResponseDto {
  fileName!: string;
  contentType!: string;
  sizeBytes!: number;
  uploadedAt!: Date;
}

/** Hồ sơ nhìn từ chính ứng viên, kèm CV hiện tại. */
export class OwnCandidateProfileResponseDto extends CandidateProfileResponseDto {
  @ApiProperty({ type: CvInfoResponseDto, nullable: true })
  cv!: CvInfoResponseDto | null;
}
