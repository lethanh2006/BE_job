import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Clock } from '../../domain';
import { PasswordHasher } from '../../application/abstractions/authentication';
import { InMemoryJobRepository } from '../persistence/in-memory-job-repository';
import {
  createDemoAccounts,
  createDemoApplications,
  createDemoCandidate,
} from '../seed/demo-data';
import { Database } from './database';
import { runMigrations } from './migrator';
import { insertCandidate } from './postgres-candidate-repository';
import { insertApplication } from './postgres-job-application-repository';
import { insertJob } from './postgres-job-repository';
import { insertAccount } from './postgres-user-account-repository';

/** Áp migration rồi nạp dữ liệu mẫu cho các bảng còn trống (tương đương JobBoardDatabaseInitializer). */
@Injectable()
export class DatabaseInitializer implements OnModuleInit {
  private readonly logger = new Logger(DatabaseInitializer.name);

  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
    private readonly passwordHasher: PasswordHasher,
    private readonly jobSeedFilePath: string,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.initialize();
  }

  async initialize(): Promise<void> {
    const applied = await runMigrations(this.db);
    if (applied.length > 0) {
      this.logger.log(`Đã áp migration: ${applied.join(', ')}`);
    }

    await this.seedIfEmpty();
  }

  private async seedIfEmpty(): Promise<void> {
    const demoAccounts = await createDemoAccounts(this.passwordHasher);
    const seedJobs = await new InMemoryJobRepository(
      this.jobSeedFilePath,
      this.clock,
    ).getAll();

    await this.db.transaction(async (tx) => {
      const isEmpty = async (table: string) =>
        (await tx.query(`SELECT 1 FROM ${table} LIMIT 1`)).rows.length === 0;

      if (await isEmpty('jobs')) {
        for (const job of seedJobs) await insertJob(tx, job);
      }
      if (await isEmpty('candidates')) {
        await insertCandidate(tx, createDemoCandidate());
      }
      if (await isEmpty('user_accounts')) {
        for (const account of demoAccounts) await insertAccount(tx, account);
      }
      if (await isEmpty('job_applications')) {
        for (const application of createDemoApplications()) {
          await insertApplication(tx, application);
        }
      }
    });
  }
}
