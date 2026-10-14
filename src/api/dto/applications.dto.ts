import { IsEnum, IsInt } from 'class-validator';
import { ApplicationStatus } from '../../domain';

export class ApplyDto {
  @IsInt() jobId!: number;
}

export class ChangeApplicationStatusDto {
  @IsEnum(ApplicationStatus) status!: ApplicationStatus;
}

/** Đơn ứng tuyển như được lưu. */
export class ApplicationResponseDto {
  id!: number;
  jobId!: number;
  candidateId!: number;
  status!: ApplicationStatus;
  appliedAt!: Date;
}

/** Đơn ứng tuyển kèm thông tin tin tuyển dụng, dùng cho màn hình danh sách. */
export class ApplicationDetailResponseDto extends ApplicationResponseDto {
  candidateName!: string;
  jobTitle!: string;
  company!: string;
  location!: string;
}
