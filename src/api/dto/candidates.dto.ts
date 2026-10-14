import {
  ArrayMaxSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

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
