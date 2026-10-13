import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { join } from 'node:path';
import {
  AccessTokenGenerator,
  AccountRegistrationRepository,
  AccountSecurityRepository,
  PasswordHasher,
  RefreshTokenGenerator,
  RefreshTokenRepository,
  UserAccountRepository,
} from './application/abstractions/authentication';
import {
  CandidateRepository,
  JobApplicationRepository,
  JobRepository,
} from './application/abstractions/persistence';
import { ApplicationQueryService } from './application/applications/application-query.service';
import { ApplicationService } from './application/applications/application.service';
import { LoginService } from './application/auth/login.service';
import { PasswordChangeService } from './application/auth/password-change.service';
import { RegistrationService } from './application/auth/registration.service';
import { SessionService } from './application/auth/session.service';
import { CandidateProfileService } from './application/candidates/candidate-profile.service';
import { JobDetailService } from './application/jobs/job-detail.service';
import { JobManagementService } from './application/jobs/job-management.service';
import { JobSearchService } from './application/jobs/job-search.service';
import { ApplicationsController } from './api/controllers/applications.controller';
import { AuthController } from './api/controllers/auth.controller';
import { CandidatesController } from './api/controllers/candidates.controller';
import { EmployersController } from './api/controllers/employers.controller';
import { HealthController } from './api/controllers/health.controller';
import { JobsController } from './api/controllers/jobs.controller';
import { JwtAuthGuard, RolesGuard } from './api/auth/auth';
import { ProblemDetailsFilter } from './api/errors/problem-details.filter';
import { AppConfig } from './config/app-config';
import { Clock, SystemClock } from './domain';
import { JwtAccessTokenGenerator } from './infrastructure/auth/jwt-access-token-generator';
import { Pbkdf2PasswordHasher } from './infrastructure/auth/pbkdf2-password-hasher';
import { SecureRefreshTokenGenerator } from './infrastructure/auth/secure-refresh-token-generator';
import { InMemoryCandidateRepository } from './infrastructure/persistence/in-memory-candidate-repository';
import { InMemoryJobApplicationRepository } from './infrastructure/persistence/in-memory-job-application-repository';
import { InMemoryJobRepository } from './infrastructure/persistence/in-memory-job-repository';
import { InMemoryRefreshTokenRepository } from './infrastructure/persistence/in-memory-refresh-token-repository';
import { InMemoryUserAccountRepository } from './infrastructure/persistence/in-memory-user-account-repository';

/** Repository tài khoản dùng chung cho 3 abstraction (đọc / đăng ký / bảo mật). */
const USER_ACCOUNTS = Symbol('IN_MEMORY_USER_ACCOUNTS');

@Module({
  controllers: [
    HealthController,
    JobsController,
    AuthController,
    ApplicationsController,
    CandidatesController,
    EmployersController,
  ],
  providers: [
    { provide: AppConfig, useFactory: () => AppConfig.fromEnv() },
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
    {
      provide: RefreshTokenRepository,
      useClass: InMemoryRefreshTokenRepository,
    },
    {
      provide: JobRepository,
      inject: [Clock],
      useFactory: (clock: Clock) =>
        new InMemoryJobRepository(
          join(__dirname, 'data', 'seed', 'jobs.json'),
          clock,
        ),
    },
    {
      provide: JobApplicationRepository,
      useFactory: () => new InMemoryJobApplicationRepository(true),
    },
    {
      provide: CandidateRepository,
      useFactory: () => new InMemoryCandidateRepository(true),
    },
    {
      provide: USER_ACCOUNTS,
      inject: [PasswordHasher, CandidateRepository],
      useFactory: (hasher: PasswordHasher, candidates: CandidateRepository) =>
        InMemoryUserAccountRepository.createWithDemoData(hasher, candidates),
    },
    { provide: UserAccountRepository, useExisting: USER_ACCOUNTS },
    { provide: AccountRegistrationRepository, useExisting: USER_ACCOUNTS },
    { provide: AccountSecurityRepository, useExisting: USER_ACCOUNTS },
    JobSearchService,
    JobDetailService,
    JobManagementService,
    ApplicationService,
    ApplicationQueryService,
    CandidateProfileService,
    LoginService,
    SessionService,
    RegistrationService,
    PasswordChangeService,
    JwtAuthGuard,
    RolesGuard,
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
})
export class AppModule {}
