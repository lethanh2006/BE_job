export enum AccountRole {
  Candidate = 'Candidate',
  Employer = 'Employer',
  Admin = 'Admin',
}

export interface UserAccount {
  readonly id: number;
  readonly name: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly role: AccountRole;
  readonly companyId?: number | null;
  readonly companyName?: string | null;
}

export interface AccessToken {
  value: string;
  expiresAt: Date;
}

export interface AuthenticatedUserDto {
  id: number;
  name: string;
  email: string;
  role: AccountRole;
  companyId: number | null;
  companyName: string | null;
}

export interface LoginResult {
  accessToken: string;
  expiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: AuthenticatedUserDto;
}

export function toAuthenticatedUser(
  account: UserAccount,
): AuthenticatedUserDto {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
    companyId: account.companyId ?? null,
    companyName: account.companyName ?? null,
  };
}
