import {
  AlreadyAppliedException,
  ApplicationStatus,
  Candidate,
  JobApplication,
  SalaryRange,
  Skill,
  SystemClock,
} from '../src/domain';
import { EmailAlreadyExistsException } from '../src/application/exceptions';
import { AccountRole, RefreshTokenSession } from '../src/application/auth';
import { Pbkdf2PasswordHasher } from '../src/infrastructure/auth/pbkdf2-password-hasher';
import { SecureRefreshTokenGenerator } from '../src/infrastructure/auth/secure-refresh-token-generator';
import { Database } from '../src/infrastructure/postgres/database';
import { DatabaseInitializer } from '../src/infrastructure/postgres/database-initializer';
import { runMigrations } from '../src/infrastructure/postgres/migrator';
import { PostgresCandidateRepository } from '../src/infrastructure/postgres/postgres-candidate-repository';
import { PostgresJobApplicationRepository } from '../src/infrastructure/postgres/postgres-job-application-repository';
import { PostgresJobRepository } from '../src/infrastructure/postgres/postgres-job-repository';
import { PostgresRefreshTokenRepository } from '../src/infrastructure/postgres/postgres-refresh-token-repository';
import { PostgresUserAccountRepository } from '../src/infrastructure/postgres/postgres-user-account-repository';
import { JOB_SEED_FILE } from '../src/infrastructure/seed/paths';
import { MutableClock, makeJob } from '../src/testing/test-helpers';
import {
  createTestDatabase,
  E2E_POSTGRES_URL,
} from './support/postgres-test-database';

// Kiểm thử tích hợp tầng lưu trữ PostgreSQL; chỉ chạy khi có E2E_POSTGRES_URL.
const describeWithPostgres = E2E_POSTGRES_URL ? describe : describe.skip;

describeWithPostgres('Tầng lưu trữ PostgreSQL', () => {
  let testDatabase: Awaited<ReturnType<typeof createTestDatabase>>;
  let db: Database;
  const clock = new SystemClock();
  const hasher = new Pbkdf2PasswordHasher();

  beforeAll(async () => {
    testDatabase = await createTestDatabase(E2E_POSTGRES_URL!);
    db = Database.connect(testDatabase.url, 5);
    await new DatabaseInitializer(
      db,
      clock,
      hasher,
      JOB_SEED_FILE,
    ).initialize();
  }, 60_000);

  afterAll(async () => {
    await db.close();
    await testDatabase.drop();
  });

  const count = async (table: string) =>
    Number(
      (await db.query<{ n: string }>(`SELECT count(*) AS n FROM ${table}`))
        .rows[0].n,
    );

  it('migration chạy lại không áp thêm gì, dữ liệu seed không bị nhân đôi', async () => {
    const before = [
      await count('jobs'),
      await count('user_accounts'),
      await count('job_applications'),
    ];

    expect(await runMigrations(db)).toEqual([]);
    await new DatabaseInitializer(
      db,
      clock,
      hasher,
      JOB_SEED_FILE,
    ).initialize();

    expect([
      await count('jobs'),
      await count('user_accounts'),
      await count('job_applications'),
    ]).toEqual(before);
    expect(before[0]).toBeGreaterThanOrEqual(6);
  });

  it('cấp mã bằng sequence bắt đầu sau dữ liệu seed', async () => {
    const jobs = new PostgresJobRepository(db, clock);
    const applications = new PostgresJobApplicationRepository(db);
    const accounts = new PostgresUserAccountRepository(db);

    expect(await jobs.getNextId()).toBeGreaterThanOrEqual(7);
    expect(await applications.getNextId()).toBeGreaterThanOrEqual(4);
    expect(await accounts.getNextUserId()).toBeGreaterThanOrEqual(101);
  });

  it('lưu và đọc lại tin tuyển dụng đầy đủ trường (mảng, số thập phân, trạng thái)', async () => {
    const jobs = new PostgresJobRepository(db, clock);
    const job = makeJob(clock, {
      id: await jobs.getNextId(),
      title: 'Kiểm thử round-trip',
      salary: [1500.5, 2500.75],
      skills: ['Go', 'Rust'],
      publish: false,
    });

    await jobs.add(job);
    job.publish();
    await jobs.update(job);
    const loaded = (await jobs.getById(job.id))!;

    expect(loaded.title).toBe('Kiểm thử round-trip');
    expect(loaded.salary.min).toBe(1500.5);
    expect(loaded.salary.max).toBe(2500.75);
    expect(loaded.skills.map((s) => s.name)).toEqual(['Go', 'Rust']);
    expect(loaded.status).toBe('Published');
    expect(loaded.company?.name).toBe('Công ty 30');
    expect(loaded.deadline.getTime()).toBe(job.deadline.getTime());
  });

  it('hai request ứng tuyển song song: đúng một request thành công', async () => {
    const applications = new PostgresJobApplicationRepository(db);
    const candidates = new PostgresCandidateRepository(db);
    const accounts = new PostgresUserAccountRepository(db);
    const candidateId = await accounts.getNextUserId();
    await candidates.add(
      new Candidate(candidateId, 'Song song', `song.song.${candidateId}@x.vn`),
    );

    const attempt = async () =>
      applications.add(
        new JobApplication(
          await applications.getNextId(),
          1,
          candidateId,
          new Date(),
        ),
      );
    const results = await Promise.allSettled([attempt(), attempt()]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find(
      (r) => r.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(failure.reason).toBeInstanceOf(AlreadyAppliedException);
  });

  it('cập nhật trạng thái đơn được lưu lại', async () => {
    const applications = new PostgresJobApplicationRepository(db);
    const application = (await applications.getById(1))!;
    const manager = { canManage: () => true } as never;
    application.changeStatus(
      ApplicationStatus.Accepted,
      manager,
      makeJob(clock, { id: application.jobId, companyId: 1 }),
    );

    await applications.update(application);

    expect((await applications.getById(1))!.status).toBe(
      ApplicationStatus.Accepted,
    );
  });

  it('đăng ký tài khoản + hồ sơ trong một giao dịch; email trùng không để lại dữ liệu mồ côi', async () => {
    const accounts = new PostgresUserAccountRepository(db);
    const id = await accounts.getNextUserId();
    const account = {
      id,
      name: 'Mới',
      email: `moi.${id}@example.com`,
      passwordHash: 'hash',
      role: AccountRole.Candidate,
    };

    expect(
      await accounts.registerCandidate(
        account,
        new Candidate(id, 'Mới', account.email),
      ),
    ).toBe(true);

    const duplicateId = await accounts.getNextUserId();
    const duplicate = {
      ...account,
      id: duplicateId,
      email: account.email.toUpperCase(),
    };
    const candidatesBefore = await count('candidates');
    expect(
      await accounts.registerCandidate(
        duplicate,
        new Candidate(duplicateId, 'Trùng', duplicate.email),
      ),
    ).toBe(false);
    expect(await count('candidates')).toBe(candidatesBefore);
    expect(
      await accounts.findByEmail(account.email.toUpperCase()),
    ).toMatchObject({ id });
  });

  it('đổi email hồ sơ trùng với ứng viên khác báo xung đột', async () => {
    const candidates = new PostgresCandidateRepository(db);
    const accounts = new PostgresUserAccountRepository(db);
    const a = await accounts.getNextUserId();
    const b = await accounts.getNextUserId();
    await candidates.add(new Candidate(a, 'A', `a.${a}@x.vn`));
    const second = new Candidate(b, 'B', `b.${b}@x.vn`);
    await candidates.add(second);

    second.updateProfile(`A.${a}@x.vn`, null, new SalaryRange(1, 2), [
      new Skill('Go'),
    ]);

    await expect(candidates.update(second)).rejects.toBeInstanceOf(
      EmailAlreadyExistsException,
    );
  });

  it('truy vấn theo lô: getByIds, getByCompanyId, countByJobIds', async () => {
    const jobs = new PostgresJobRepository(db, clock);
    const applications = new PostgresJobApplicationRepository(db);
    const candidates = new PostgresCandidateRepository(db);

    expect((await jobs.getByIds([1, 2, 999])).map((j) => j.id)).toEqual([1, 2]);
    expect(await jobs.getByIds([])).toEqual([]);
    expect((await jobs.getByCompanyId(1)).every((j) => j.companyId === 1)).toBe(
      true,
    );
    expect((await candidates.getByIds([20, 999])).map((c) => c.id)).toEqual([
      20,
    ]);
    expect(
      (await applications.getByJobIds([2, 5])).map((a) => a.jobId).sort(),
    ).toEqual([2, 5]);
    const counts = await applications.countByJobIds([2, 5, 6, 1000]);
    expect(counts.get(2)).toBe(1);
    expect(counts.has(1000)).toBe(false);
    expect((await applications.countByJobIds([])).size).toBe(0);
  });

  it('cập nhật mật khẩu có điều kiện chỉ thành công với hash hiện tại', async () => {
    const accounts = new PostgresUserAccountRepository(db);
    const current = (await accounts.findById(20))!;

    expect(await accounts.tryUpdatePasswordHash(20, 'sai', 'x')).toBe(false);
    expect(
      await accounts.tryUpdatePasswordHash(
        20,
        current.passwordHash,
        current.passwordHash,
      ),
    ).toBe(true);
  });

  it('xoay refresh token song song: đúng một request thắng', async () => {
    const tokens = new PostgresRefreshTokenRepository(db);
    const generator = new SecureRefreshTokenGenerator(
      new MutableClock(new Date()),
      86_400_000,
    );
    const issued = generator.generate(20);
    await tokens.add(issued.session);
    const rotate = () => {
      const next = generator.generate(20, issued.session.familyId);
      return tokens.tryRotate(
        issued.session.id,
        next.session.tokenHash,
        next.session,
        new Date(),
      );
    };

    const results = await Promise.all([rotate(), rotate(), rotate()]);

    expect(results.filter(Boolean)).toHaveLength(1);
    const stored: RefreshTokenSession = (await tokens.findByHash(
      issued.session.tokenHash,
    ))!;
    expect(stored.revokedAt).not.toBeNull();
    await tokens.revokeFamily(issued.session.familyId, new Date());
    const rows = await db.query(
      'SELECT 1 FROM refresh_tokens WHERE family_id = $1 AND revoked_at IS NULL',
      [issued.session.familyId],
    );
    expect(rows.rows).toHaveLength(0);
  });
});
