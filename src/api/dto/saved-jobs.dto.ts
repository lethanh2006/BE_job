import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { JobSummaryResponseDto } from './jobs.dto';

export class SavedJobsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  page?: number = 1;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}

export class SavedJobParamsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  jobId!: number;
}

export class SavedJobIdsQueryDto {
  /** Mã tin cần kiểm tra, phân cách bằng dấu phẩy hoặc tham số lặp; tối đa 100. */
  @Transform(({ value }: { value: unknown }) =>
    value === undefined
      ? undefined
      : (Array.isArray(value) ? value : [value])
          .flatMap((item) => String(item).split(','))
          .map(Number),
  )
  @IsArray()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(2147483647, { each: true })
  jobIds!: number[];
}

export class SavedJobResponseDto {
  jobId!: number;
  savedAt!: Date;
  @ApiProperty({ enum: ['Open', 'Closed', 'Expired', 'Unavailable'] })
  availability!: 'Open' | 'Closed' | 'Expired' | 'Unavailable';
  @ApiProperty({ type: JobSummaryResponseDto, nullable: true })
  job!: JobSummaryResponseDto | null;
}

export class SavedJobsPageResponseDto {
  @ApiProperty({ type: () => [SavedJobResponseDto] })
  items!: SavedJobResponseDto[];
  page!: number;
  pageSize!: number;
  totalItems!: number;
  totalPages!: number;
}
