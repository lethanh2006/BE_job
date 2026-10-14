import { DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import {
  AccessTokenGenerator,
  PasswordHasher,
  RefreshTokenGenerator,
  ResetTokenGenerator,
} from './application/abstractions/authentication';
import { EmailSender } from './application/abstractions/email';
import { RateLimitStore } from './application/abstractions/rate-limiting';
import { ApplicationNotifier } from './application/abstractions/notifications';
import { ApplicationQueryService } from './application/applications/application-query.service';
import { ApplicationService } from './application/applications/application.service';
import { LoginAttemptLimiter } from './application/auth/login-attempt-limiter';
import { LoginService } from './application/auth/login.service';
import { PasswordChangeService } from './application/auth/password-change.service';
import {
  PasswordResetService,
  PasswordResetSettings,
} from './application/auth/password-reset.service';
import { RegistrationService } from './application/auth/registration.service';
import { SessionService } from './application/auth/session.service';
import { AdminModerationService } from './application/admin/admin-moderation.service';
import { AdminQueryService } from './application/admin/admin-query.service';
import { CompanyService } from './application/companies/company.service';
import { CandidateCvService } from './application/candidates/candidate-cv.service';
import { CandidateProfileService } from './application/candidates/candidate-profile.service';
import { SavedJobService } from './application/candidates/saved-job.service';
import { CandidateMatchService } from './application/matching/candidate-match.service';
import { JobMatchService } from './application/matching/job-match.service';
import { JobDetailService } from './application/jobs/job-detail.service';
import { JobManagementService } from './application/jobs/job-management.service';
import { JobSearchService } from './application/jobs/job-search.service';
import { NotificationService } from './application/notifications/notification.service';
import { JwtAuthGuard, RolesGuard } from './api/auth/auth';
import { AdminController } from './api/controllers/admin.controller';
import { ApplicationsController } from './api/controllers/applications.controller';
import { AuthController } from './api/controllers/auth.controller';
import { CompaniesController } from './api/controllers/companies.controller';
import { CandidatesController } from './api/controllers/candidates.controller';
import { EmployersController } from './api/controllers/employers.controller';
import { HealthController } from './api/controllers/health.controller';
import { JobsController } from './api/controllers/jobs.controller';
import { NotificationsController } from './api/controllers/notifications.controller';
import { SavedJobsController } from './api/controllers/saved-jobs.controller';
import { ProblemDetailsFilter } from './api/errors/problem-details.filter';
import { RateLimitGuard } from './api/rate-limit/rate-limit';
import { AppConfig } from './config/app-config';
import { Clock, SystemClock } from './domain';
import { JwtAccessTokenGenerator } from './infrastructure/auth/jwt-access-token-generator';
import { Pbkdf2PasswordHasher } from './infrastructure/auth/pbkdf2-password-hasher';
import { SecureRefreshTokenGenerator } from './infrastructure/auth/secure-refresh-token-generator';
import { SecureResetTokenGenerator } from './infrastructure/auth/secure-reset-token-generator';
import { createEmailSender } from './infrastructure/email/create-email-sender';
import { persistenceProviders } from './infrastructure/persistence/persistence-providers';
import { InMemoryRateLimitStore } from './infrastructure/rate-limiting/in-memory-rate-limit-store';

@Module({
  controllers: [
    SavedJobsController,
    NotificationsController,
    HealthController,
    JobsController,
    AuthController,
    ApplicationsController,
    CandidatesController,
    CompaniesController,
    AdminController,
    EmployersController,
  ],
  providers: [
    SavedJobService,
    { provide: Clock, useClass: SystemClock },
    { provide: PasswordHasher, useClass: Pbkdf2PasswordHasher },
    { provide: AccessTokenGenerator, useClass: JwtAccessTokenGenerator },
    {
      provide: RefreshTokenGenerator,
      inject: [Clock, AppConfig],
      useFactory: (clock: Clock, config: AppConfig) =>
        new SecureRefreshTokenGenerator(
          clock,
          config.jwt.refreshTokenDays * 24 * 60 * 60 * 1000,
        ),
    },
    { provide: RateLimitStore, useClass: InMemoryRateLimitStore },
    {
      provide: LoginAttemptLimiter,
      inject: [RateLimitStore, Clock, AppConfig],
      useFactory: (store: RateLimitStore, clock: Clock, config: AppConfig) =>
        new LoginAttemptLimiter(store, clock, config.security.rateLimitEnabled),
    },
    RateLimitGuard,
    { provide: ResetTokenGenerator, useClass: SecureResetTokenGenerator },
    {
      provide: EmailSender,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => createEmailSender(config.email),
    },
    {
      provide: PasswordResetSettings,
      inject: [AppConfig],
      useFactory: (config: AppConfig): PasswordResetSettings => ({
        resetPageUrl: config.passwordReset.resetPageUrl,
        tokenLifetimeMinutes: config.passwordReset.tokenMinutes,
      }),
    },
    NotificationService,
    { provide: ApplicationNotifier, useExisting: NotificationService },
    JobMatchService,
    CandidateMatchService,
    JobSearchService,
    JobDetailService,
    JobManagementService,
    ApplicationService,
    ApplicationQueryService,
    CandidateProfileService,
    CandidateCvService,
    CompanyService,
    AdminQueryService,
    AdminModerationService,
    LoginService,
    SessionService,
    RegistrationService,
    PasswordChangeService,
    PasswordResetService,
    JwtAuthGuard,
    RolesGuard,
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
})
export class AppModule {
  /** Cấu hình lúc chạy (mặc định đọc từ biến môi trường) quyết định provider lưu trữ. */
  static register(config: AppConfig = AppConfig.fromEnv()): DynamicModule {
    return {
      module: AppModule,
      providers: [
        { provide: AppConfig, useValue: config },
        ...persistenceProviders(config),
      ],
    };
  }
}
