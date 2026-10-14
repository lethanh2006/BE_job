import { IsEnum, IsInt } from 'class-validator';
import { ApplicationStatus } from '../../domain';
import { CandidateProfileResponseDto } from './candidates.dto';

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

/** Đơn ứng tuyển dưới góc nhìn nhà tuyển dụng, kèm độ phù hợp của ứng viên. */
export class EmployerApplicationResponseDto extends ApplicationDetailResponseDto {
  /** Độ phù hợp 0–100 (70% kỹ năng, 30% mức lương). */
  matchScore!: number;
}

export class ApplicantDetailResponseDto {
  application!: EmployerApplicationResponseDto;
  candidate!: CandidateProfileResponseDto;
  /** Kỹ năng tin yêu cầu mà ứng viên có. */
  matchedSkills!: string[];
  /** Kỹ năng tin yêu cầu mà ứng viên chưa có. */
  missingSkills!: string[];
  /** Khoảng lương mong muốn của ứng viên giao với khoảng lương của tin. */
  salaryFit!: boolean;
}
