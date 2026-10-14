import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AccountRole } from '../../application/auth';
import { BootstrapAdminConfig } from '../../config/app-config';
import { Clock } from '../../domain';
import { PasswordHasher } from '../../application/abstractions/authentication';
import { InMemoryJobRepository } from '../persistence/in-memory-job-repository';
import { loadSeedCompanies } from '../seed/seed-companies';
import {
  createDemoAccounts,
  createDemoApplications,
  createDemoCandidate,
} from '../seed/demo-data';
import { runMigrations } from './migrator';
import { insertCandidate } from './postgres-candidate-repository';
import { insertCompany } from './postgres-company-repository';
import { insertApplication } from './postgres-job-application-repository';
import { insertJob } from './postgres-job-repository';
import { Database, isPgError, PgErrorCode } from './database';
import { insertAccount } from './postgres-user-account-repository';

export interface DatabaseInitializerOptions {
  /** Nạp dữ liệu mẫu (kể cả tài khoản demo) vào các bảng còn trống. */
  seedDemoData: boolean;
  bootstrapAdmin: BootstrapAdminConfig | null;
}

/** Khóa advisory để nhiều instance khởi động cùng lúc không cùng tạo quản trị viên đầu tiên. */
const BOOTSTRAP_ADMIN_LOCK_KEY = 7_426_002;

/** Áp migration rồi nạp dữ liệu mẫu cho các bảng còn trống (tương đương JobBoardDatabaseInitializer). */
@Injectable()
export class DatabaseInitializer implements OnModuleInit {
  private readonly logger = new Logger(DatabaseInitializer.name);

  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
    private readonly passwordHasher: PasswordHasher,
    private readonly jobSeedFilePath: string,
    private readonly options: DatabaseInitializerOptions = {
      seedDemoData: true,
      bootstrapAdmin: null,
    },
  ) {}

  async onModuleInit(): Promise<void> {
    await this.initialize();
  }

  async initialize(): Promise<void> {
    const applied = await runMigrations(this.db);
    if (applied.length > 0) {
      this.logger.log(`Đã áp migration: ${applied.join(', ')}`);
    }

    if (this.options.seedDemoData) await this.seedIfEmpty();
    if (this.options.bootstrapAdmin) {
      await this.ensureAdmin(this.options.bootstrapAdmin);
    }
  }

  /** Chỉ tạo khi chưa có quản trị viên nào, nên khởi động lại không đặt lại mật khẩu đã đổi. */
  private async ensureAdmin(admin: BootstrapAdminConfig): Promise<void> {
    const passwordHash = await this.passwordHasher.hash(admin.password);

    try {
      const created = await this.db.transaction(async (tx) => {
        await tx.query('SELECT pg_advisory_xact_lock($1)', [
          BOOTSTRAP_ADMIN_LOCK_KEY,
        ]);
        const existing = await tx.query(
          'SELECT 1 FROM user_accounts WHERE role = $1 LIMIT 1',
          [AccountRole.Admin],
        );
        if (existing.rows.length > 0) return false;

        const { rows } = await tx.query<{ id: number }>(
          "SELECT nextval('user_ids')::integer AS id",
        );
        await insertAccount(tx, {
          id: rows[0].id,
          name: admin.name,
          email: admin.email,
          passwordHash,
          role: AccountRole.Admin,
        });
        return true;
      });
      if (created) {
        this.logger.log(`Đã tạo quản trị viên đầu tiên: ${admin.email}`);
      }
    } catch (error) {
      if (!isPgError(error, PgErrorCode.UniqueViolation)) throw error;
      this.logger.warn(
        `Không tạo được quản trị viên đầu tiên: email ${admin.email} đã được một tài khoản khác dùng.`,
      );
    }
  }

  private async seedIfEmpty(): Promise<void> {
    const demoAccounts = await createDemoAccounts(this.passwordHasher);
    const seedCompanies = await loadSeedCompanies(this.jobSeedFilePath);
    const seedJobs = await new InMemoryJobRepository(
      this.jobSeedFilePath,
      this.clock,
    ).getAll();

    await this.db.transaction(async (tx) => {
      const isEmpty = async (table: string) =>
        (await tx.query(`SELECT 1 FROM ${table} LIMIT 1`)).rows.length === 0;

      if (await isEmpty('companies')) {
        for (const company of seedCompanies) await insertCompany(tx, company);
      }
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
