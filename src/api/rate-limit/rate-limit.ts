import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import {
  RateLimitStore,
  secondsUntil,
  waitPhrase,
} from '../../application/abstractions/rate-limiting';
import { TooManyRequestsException } from '../../application/exceptions';
import { AppConfig } from '../../config/app-config';
import { Clock } from '../../domain';
import { clientKey } from './client-key';

export interface RateLimitOptions {
  /** Tên nhóm giới hạn; các endpoint dùng chung tên thì dùng chung bộ đếm. */
  name: string;
  limit: number;
  windowSeconds: number;
}

const RATE_LIMIT_KEY = 'rateLimit';

/** Giới hạn số request mỗi cửa sổ thời gian theo IP của client cho một endpoint. */
export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly store: RateLimitStore,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.config.security.rateLimitEnabled) return true;

    const options = this.reflector.get<RateLimitOptions | undefined>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );
    if (!options) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const now = this.clock.utcNow.getTime();
    const counter = await this.store.hit(
      `${options.name}:${clientKey(request.ip)}`,
      options.windowSeconds * 1000,
      now,
    );

    const resetSeconds = secondsUntil(counter.resetAt, now);
    response.setHeader('RateLimit-Limit', String(options.limit));
    response.setHeader(
      'RateLimit-Remaining',
      String(Math.max(0, options.limit - counter.count)),
    );
    response.setHeader('RateLimit-Reset', String(resetSeconds));

    if (counter.count > options.limit) {
      throw new TooManyRequestsException(
        `Bạn gửi yêu cầu quá nhanh. Vui lòng thử lại sau ${waitPhrase(resetSeconds)}.`,
        resetSeconds,
      );
    }
    return true;
  }
}
