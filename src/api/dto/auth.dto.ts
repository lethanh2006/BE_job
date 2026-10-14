import { IsString } from 'class-validator';
import { AccountRole } from '../../application/auth';

export class LoginDto {
  @IsString() email!: string;
  @IsString() password!: string;
}

export class RegisterCandidateDto {
  @IsString() name!: string;
  @IsString() email!: string;
  /** Tối thiểu 10 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt. */
  @IsString() password!: string;
}

export class RefreshTokenDto {
  @IsString() refreshToken!: string;
}

export class ChangePasswordDto {
  @IsString() currentPassword!: string;
  @IsString() newPassword!: string;
}

export class AuthenticatedUserResponseDto {
  id!: number;
  name!: string;
  email!: string;
  role!: AccountRole;
  /** Chỉ có với tài khoản nhà tuyển dụng. */
  companyId!: number | null;
  companyName!: string | null;
}

export class LoginResultResponseDto {
  accessToken!: string;
  expiresAt!: Date;
  /** Refresh token dùng một lần; mỗi lần làm mới sẽ cấp token mới. */
  refreshToken!: string;
  refreshExpiresAt!: Date;
  user!: AuthenticatedUserResponseDto;
}
