import { Injectable } from '@nestjs/common';
import { sign } from 'jsonwebtoken';
import { Clock } from '../../domain';
import { AccessTokenGenerator } from '../../application/abstractions/authentication';
import { AccessToken, UserAccount } from '../../application/auth';
import { AppConfig } from '../../config/app-config';

/** Tên claim trong access token (giống backend C#). */
export const ClaimTypes = {
  Subject: 'sub',
  Name: 'name',
  Email: 'email',
  Role: 'role',
  CompanyId: 'company_id',
  CompanyName: 'company_name',
} as const;

@Injectable()
export class JwtAccessTokenGenerator extends AccessTokenGenerator {
  constructor(
    private readonly config: AppConfig,
    private readonly clock: Clock,
  ) {
    super();
  }

  generate(account: UserAccount): Promise<AccessToken> {
    const issuedAt = this.clock.utcNow;
    const expiresAt = new Date(
      issuedAt.getTime() + this.config.jwt.accessTokenMinutes * 60_000,
    );
    const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

    const payload: Record<string, string | number> = {
      [ClaimTypes.Subject]: String(account.id),
      [ClaimTypes.Name]: account.name,
      [ClaimTypes.Email]: account.email,
      [ClaimTypes.Role]: account.role,
      nbf: seconds(issuedAt),
      exp: seconds(expiresAt),
    };
    if (account.companyId != null) {
      payload[ClaimTypes.CompanyId] = String(account.companyId);
    }
    if (account.companyName?.trim()) {
      payload[ClaimTypes.CompanyName] = account.companyName;
    }

    const value = sign(payload, this.config.jwt.signingKey, {
      issuer: this.config.jwt.issuer,
      audience: this.config.jwt.audience,
      algorithm: 'HS256',
    });

    return Promise.resolve({ value, expiresAt });
  }
}
