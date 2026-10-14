import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateCandidateProfileDto {
  @IsString() email!: string;
  @IsOptional() @IsString() bio?: string | null;
  /** Phải đi cùng `desiredSalaryMax`; bỏ trống cả hai để xóa khoảng lương. */
  @IsOptional() @IsNumber() desiredSalaryMin?: number | null;
  @IsOptional() @IsNumber() desiredSalaryMax?: number | null;
  /** Tối đa 30 kỹ năng, không phân biệt hoa thường. */
  @IsArray() @IsString({ each: true }) skills!: string[];
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
