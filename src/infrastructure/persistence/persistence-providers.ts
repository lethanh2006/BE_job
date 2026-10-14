import { Provider } from '@nestjs/common';
import {
  AccountRegistrationRepository,
  AccountSecurityRepository,
  PasswordHasher,
  RefreshTokenRepository,
  UserAccountRepository,
} from '../../application/abstractions/authentication';
import {
  CandidateRepository,
  JobApplicationRepository,
  JobRepository,
  JobSearchReader,
} from '../../application/abstractions/persistence';
import { AppConfig } from '../../config/app-config';
import { Clock } from '../../domain';
import { Database } from '../postgres/database';
import { DatabaseInitializer } from '../postgres/database-initializer';
import { PostgresCandidateRepository } from '../postgres/postgres-candidate-repository';
import { PostgresJobApplicationRepository } from '../postgres/postgres-job-application-repository';
import { PostgresJobRepository } from '../postgres/postgres-job-repository';
import { PostgresJobSearchReader } from '../postgres/postgres-job-search-reader';
import { PostgresRefreshTokenRepository } from '../postgres/postgres-refresh-token-repository';
import { PostgresUserAccountRepository } from '../postgres/postgres-user-account-repository';
import { JOB_SEED_FILE } from '../seed/paths';
import { InMemoryCandidateRepository } from './in-memory-candidate-repository';
import { InMemoryJobApplicationRepository } from './in-memory-job-application-repository';
import { InMemoryJobRepository } from './in-memory-job-repository';
import { InMemoryJobSearchReader } from './in-memory-job-search-reader';
import { InMemoryRefreshTokenRepository } from './in-memory-refresh-token-repository';
import { InMemoryUserAccountRepository } from './in-memory-user-account-repository';

/** Một repository tài khoản dùng chung cho 3 abstraction (đọc / đăng ký / bảo mật). */
const USER_ACCOUNTS = Symbol('USER_ACCOUNTS');

const accountAliases: Provider[] = [
  { provide: UserAccountRepository, useExisting: USER_ACCOUNTS },
  { provide: AccountRegistrationRepository, useExisting: USER_ACCOUNTS },
  { provide: AccountSecurityRepository, useExisting: USER_ACCOUNTS },
];

function inMemoryProviders(): Provider[] {
  return [
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
      provide: USER_ACCOUNTS,
      inject: [PasswordHasher, CandidateRepository],
      useFactory: (hasher: PasswordHasher, candidates: CandidateRepository) =>
        InMemoryUserAccountRepository.createWithDemoData(hasher, candidates),
    },
    ...accountAliases,
  ];
}

function postgresProviders(config: AppConfig): Provider[] {
  const providers: Provider[] = [
    {
      provide: Database,
      useFactory: () => Database.connect(config.persistence.databaseUrl!),
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
  ];

  if (config.persistence.applyMigrations) {
    providers.push({
      provide: DatabaseInitializer,
      inject: [Database, Clock, PasswordHasher],
      useFactory: (db: Database, clock: Clock, hasher: PasswordHasher) =>
        new DatabaseInitializer(db, clock, hasher, JOB_SEED_FILE),
    });
  }

  return providers;
}

export function persistenceProviders(config: AppConfig): Provider[] {
  return config.persistence.provider === 'PostgreSql'
    ? postgresProviders(config)
    : inMemoryProviders();
}
