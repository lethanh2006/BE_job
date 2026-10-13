import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { verify } from 'jsonwebtoken';
import type { Request } from 'express';
import { Company, Employer } from '../../domain';
import { AccountRole } from '../../application/auth';
import { AppConfig } from '../../config/app-config';
import { ClaimTypes } from '../../infrastructure/auth/jwt-access-token-generator';

/** Người dùng đã xác thực, đọc từ claim của access token. */
export class AuthPrincipal {
  id!: number;
  name!: string;
  email!: string;
  role!: AccountRole;
  companyId!: number | null;
  companyName!: string | null;
}

export type AuthenticatedRequest = Request & { user?: AuthPrincipal };

const ROLES_KEY = 'roles';
export const Roles = (...roles: AccountRole[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext): AuthPrincipal =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user!,
);

const asString = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const parseIntClaim = (value: unknown): number => {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new UnauthorizedException();
  }
  return Number(value);
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException();
    }

    let claims: Record<string, unknown>;
    try {
      claims = verify(token, this.config.jwt.signingKey, {
        issuer: this.config.jwt.issuer,
        audience: this.config.jwt.audience,
        algorithms: ['HS256'],
        clockTolerance: 30,
      }) as Record<string, unknown>;
    } catch {
      throw new UnauthorizedException();
    }

    const role = claims[ClaimTypes.Role];
    if (!Object.values(AccountRole).includes(role as AccountRole)) {
      throw new UnauthorizedException();
    }

    const companyId = claims[ClaimTypes.CompanyId];
    request.user = {
      id: parseIntClaim(claims[ClaimTypes.Subject]),
      name: asString(claims[ClaimTypes.Name]),
      email: asString(claims[ClaimTypes.Email]),
      role: role as AccountRole,
      companyId: companyId === undefined ? null : parseIntClaim(companyId),
      companyName:
        (claims[ClaimTypes.CompanyName] as string | undefined) ?? null,
    };
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<AccountRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles || roles.length === 0) return true;

    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user || !roles.includes(user.role)) throw new ForbiddenException();
    return true;
  }
}

/** Dựng đối tượng Employer từ claim để domain kiểm tra quyền quản lý tin. */
export function toEmployer(user: AuthPrincipal, companyId: number): Employer {
  return new Employer(
    user.id,
    user.name,
    user.email,
    new Company(companyId, `Công ty #${companyId}`),
  );
}

/** Employer chỉ được thao tác trên công ty ghi trong token. */
export function assertCompanyScope(user: AuthPrincipal, companyId: number) {
  if (user.companyId !== companyId) throw new ForbiddenException();
}
