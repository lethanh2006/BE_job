import { Provider } from '@nestjs/common';
import {
  AdminReader,
  AuditLogRepository,
} from '../../application/abstractions/admin';
import { ReadinessProbe } from '../../application/abstractions/health';
import {
  CandidateFileRepository,
  FileStorage,
} from '../../application/abstractions/files';
import { NotificationRepository } from '../../application/abstractions/notifications';
import { SavedJobRepository } from '../../application/abstractions/saved-jobs';
import {
  AccountRegistrationRepository,
  AccountSecurityRepository,
  EmployerRegistrationRepository,
  PasswordHasher,
  PasswordResetRepository,
  RefreshTokenRepository,
  UserAccountRepository,
} from '../../application/abstractions/authentication';
import {
  CandidateRepository,
  CompanyRepository,
  JobApplicationRepository,
  JobRepository,
  JobSearchReader,
} from '../../application/abstractions/persistence';
import { AppConfig } from '../../config/app-config';
import { Clock } from '../../domain';
import { AlwaysReadyProbe } from '../health/always-ready-probe';
import { PostgresReadinessProbe } from '../health/postgres-readiness-probe';
import { Database } from '../postgres/database';
import { DatabaseInitializer } from '../postgres/database-initializer';
import { PostgresAdminReader } from '../postgres/postgres-admin-reader';
import { PostgresAuditLogRepository } from '../postgres/postgres-audit-log-repository';
import { PostgresCandidateFileRepository } from '../postgres/postgres-candidate-file-repository';
import { PostgresCandidateRepository } from '../postgres/postgres-candidate-repository';
import { PostgresCompanyRepository } from '../postgres/postgres-company-repository';
import { PostgresJobApplicationRepository } from '../postgres/postgres-job-application-repository';
import { PostgresJobRepository } from '../postgres/postgres-job-repository';
import { PostgresJobSearchReader } from '../postgres/postgres-job-search-reader';
import { PostgresNotificationRepository } from '../postgres/postgres-notification-repository';
import { PostgresPasswordResetRepository } from '../postgres/postgres-password-reset-repository';
import { PostgresRefreshTokenRepository } from '../postgres/postgres-refresh-token-repository';
import { PostgresSavedJobRepository } from '../postgres/postgres-saved-job-repository';
import { PostgresUserAccountRepository } from '../postgres/postgres-user-account-repository';
import { JOB_SEED_FILE } from '../seed/paths';
import { InMemoryFileStorage } from '../storage/in-memory-file-storage';
import { LocalFileStorage } from '../storage/local-file-storage';
import { InMemoryAdminReader } from './in-memory-admin-reader';
import { InMemoryAuditLogRepository } from './in-memory-audit-log-repository';
import { InMemoryCandidateFileRepository } from './in-memory-candidate-file-repository';
import { InMemoryCandidateRepository } from './in-memory-candidate-repository';
import { InMemoryCompanyRepository } from './in-memory-company-repository';
import { InMemoryJobApplicationRepository } from './in-memory-job-application-repository';
import { InMemoryJobRepository } from './in-memory-job-repository';
import { InMemoryJobSearchReader } from './in-memory-job-search-reader';
import { InMemoryNotificationRepository } from './in-memory-notification-repository';
import { InMemoryPasswordResetRepository } from './in-memory-password-reset-repository';
import { InMemoryRefreshTokenRepository } from './in-memory-refresh-token-repository';
import { InMemorySavedJobRepository } from './in-memory-saved-job-repository';
import { InMemoryUserAccountRepository } from './in-memory-user-account-repository';

/** Một repository tài khoản dùng chung cho 3 abstraction (đọc / đăng ký / bảo mật). */
const USER_ACCOUNTS = Symbol('USER_ACCOUNTS');

const accountAliases: Provider[] = [
  { provide: UserAccountRepository, useExisting: USER_ACCOUNTS },
  { provide: AccountRegistrationRepository, useExisting: USER_ACCOUNTS },
  { provide: EmployerRegistrationRepository, useExisting: USER_ACCOUNTS },
  { provide: AccountSecurityRepository, useExisting: USER_ACCOUNTS },
];

function inMemoryProviders(): Provider[] {
  return [
    { provide: ReadinessProbe, useClass: AlwaysReadyProbe },
    { provide: SavedJobRepository, useClass: InMemorySavedJobRepository },
    { provide: FileStorage, useClass: InMemoryFileStorage },
    {
      provide: CandidateFileRepository,
      inject: [JobApplicationRepository],
      useFactory: (applications: JobApplicationRepository) =>
        new InMemoryCandidateFileRepository(applications),
    },
    {
      provide: RefreshTokenRepository,
      useClass: InMemoryRefreshTokenRepository,
    },
    {
      provide: JobRepository,
      inject: [Clock],
      useFactory: (clock: Clock) =>
        new InMemoryJobRepository(JOB_SEED_FILE, clock),
    },
    {
      provide: JobSearchReader,
      inject: [JobRepository],
      useFactory: (jobs: JobRepository) => new InMemoryJobSearchReader(jobs),
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
      provide: CompanyRepository,
      useFactory: () => new InMemoryCompanyRepository(JOB_SEED_FILE),
    },
    {
      provide: USER_ACCOUNTS,
      inject: [PasswordHasher, CandidateRepository, CompanyRepository],
      useFactory: (
        hasher: PasswordHasher,
        candidates: CandidateRepository,
        companies: CompanyRepository,
      ) =>
        InMemoryUserAccountRepository.createWithDemoData(
          hasher,
          candidates,
          companies,
        ),
    },
    ...accountAliases,
    {
      provide: PasswordResetRepository,
      inject: [USER_ACCOUNTS],
      useFactory: (accounts: InMemoryUserAccountRepository) =>
        new InMemoryPasswordResetRepository(accounts),
    },
    { provide: AuditLogRepository, useClass: InMemoryAuditLogRepository },
    {
      provide: NotificationRepository,
      useClass: InMemoryNotificationRepository,
    },
    {
      provide: AdminReader,
      inject: [
        JobRepository,
        JobApplicationRepository,
        CompanyRepository,
        USER_ACCOUNTS,
      ],
      useFactory: (
        jobs: JobRepository,
        applications: JobApplicationRepository,
        companies: InMemoryCompanyRepository,
        accounts: InMemoryUserAccountRepository,
      ) => new InMemoryAdminReader(jobs, applications, companies, accounts),
    },
  ];
}

function postgresProviders(config: AppConfig): Provider[] {
  const providers: Provider[] = [
    {
      provide: SavedJobRepository,
      inject: [Database],
      useFactory: (db: Database) => new PostgresSavedJobRepository(db),
    },
    {
      provide: FileStorage,
      useFactory: () => new LocalFileStorage(config.storageDirectory),
    },
    {
      provide: CandidateFileRepository,
      inject: [Database],
      useFactory: (db: Database) => new PostgresCandidateFileRepository(db),
    },
    {
      provide: Database,
      useFactory: () => Database.connect(config.persistence.databaseUrl!),
    },
    {
      provide: ReadinessProbe,
      inject: [Database],
      useFactory: (db: Database) => new PostgresReadinessProbe(db),
    },
    {
      provide: JobRepository,
      inject: [Database, Clock],
      useFactory: (db: Database, clock: Clock) =>
        new PostgresJobRepository(db, clock),
    },
    {
      provide: JobSearchReader,
      inject: [Database, Clock],
      useFactory: (db: Database, clock: Clock) =>
        new PostgresJobSearchReader(db, clock),
    },
    {
      provide: CandidateRepository,
      inject: [Database],
      useFactory: (db: Database) => new PostgresCandidateRepository(db),
    },
    {
      provide: CompanyRepository,
      inject: [Database],
      useFactory: (db: Database) => new PostgresCompanyRepository(db),
    },
    {
      provide: JobApplicationRepository,
      inject: [Database],
      useFactory: (db: Database) => new PostgresJobApplicationRepository(db),
    },
    {
      provide: RefreshTokenRepository,
      inject: [Database],
      useFactory: (db: Database) => new PostgresRefreshTokenRepository(db),
    },
    {
      provide: USER_ACCOUNTS,
      inject: [Database],
      useFactory: (db: Database) => new PostgresUserAccountRepository(db),
    },
    ...accountAliases,
    {
      provide: PasswordResetRepository,
      inject: [Database],
      useFactory: (db: Database) => new PostgresPasswordResetRepository(db),
    },
    {
      provide: AuditLogRepository,
      inject: [Database],
      useFactory: (db: Database) => new PostgresAuditLogRepository(db),
    },
    {
      provide: NotificationRepository,
      inject: [Database],
      useFactory: (db: Database) => new PostgresNotificationRepository(db),
    },
    {
      provide: AdminReader,
      inject: [Database],
      useFactory: (db: Database) => new PostgresAdminReader(db),
    },
  ];

  if (config.persistence.applyMigrations) {
    providers.push({
      provide: DatabaseInitializer,
      inject: [Database, Clock, PasswordHasher],
      useFactory: (db: Database, clock: Clock, hasher: PasswordHasher) =>
        new DatabaseInitializer(db, clock, hasher, JOB_SEED_FILE, {
          seedDemoData: config.persistence.seedDemoData,
          bootstrapAdmin: config.persistence.bootstrapAdmin,
        }),
    });
  }

  return providers;
}

export function persistenceProviders(config: AppConfig): Provider[] {
  return config.persistence.provider === 'PostgreSql'
    ? postgresProviders(config)
    : inMemoryProviders();
}
