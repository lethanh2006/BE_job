import { IsOptional, IsString, MaxLength } from 'class-validator';
import { AccountRole } from '../../application/auth';

export class LoginDto {
  @IsString() @MaxLength(320) email!: string;
  @IsString() @MaxLength(128) password!: string;
}

export class RegisterCandidateDto {
  @IsString() @MaxLength(160) name!: string;
  @IsString() @MaxLength(320) email!: string;
  /** Tối thiểu 10 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt. */
  @IsString() @MaxLength(128) password!: string;
}

export class RegisterEmployerDto {
  /** Tên người đại diện/quản lý tài khoản. */
  @IsString() @MaxLength(160) name!: string;
  @IsString() @MaxLength(320) email!: string;
  /** Tối thiểu 10 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt. */
  @IsString() @MaxLength(128) password!: string;
  /** Tên công ty phải chưa được đăng ký (không phân biệt hoa thường). */
  @IsString() @MaxLength(200) companyName!: string;
  @IsOptional() @IsString() @MaxLength(200) companyLocation?: string;
}

export class RefreshTokenDto {
  @IsString() @MaxLength(512) refreshToken!: string;
}

export class ChangePasswordDto {
  @IsString() @MaxLength(128) currentPassword!: string;
  @IsString() @MaxLength(128) newPassword!: string;
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
