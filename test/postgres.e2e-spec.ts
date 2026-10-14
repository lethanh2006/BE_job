import {
  AlreadyAppliedException,
  Company,
  Job,
  JobLevel,
  JobStatus,
  WorkMode,
  ApplicationStatus,
  Candidate,
  JobApplication,
  SalaryRange,
  Skill,
  SystemClock,
} from '../src/domain';
import { JobSearchCriteria } from '../src/application/abstractions/persistence';
import { JobSortOrder } from '../src/application/jobs/dto';
import { EmailAlreadyExistsException } from '../src/application/exceptions';
import { InMemoryJobSearchReader } from '../src/infrastructure/persistence/in-memory-job-search-reader';
import { PostgresJobSearchReader } from '../src/infrastructure/postgres/postgres-job-search-reader';
import { FakeJobRepository } from '../src/testing/test-helpers';
import { foldText } from '../src/application/common/text-folding';
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

describeWithPostgres('Tìm kiếm tin: PostgreSQL khớp bản in-memory', () => {
  let testDatabase: Awaited<ReturnType<typeof createTestDatabase>>;
  let db: Database;
  const clock = new SystemClock();
  const day = 86_400_000;

  const baseCriteria: JobSearchCriteria = {
    skills: [],
    sort: JobSortOrder.Newest,
    page: 1,
    pageSize: 50,
  };

  beforeAll(async () => {
    testDatabase = await createTestDatabase(E2E_POSTGRES_URL!);
    db = Database.connect(testDatabase.url, 5);
    await new DatabaseInitializer(
      db,
      clock,
      hasher(),
      JOB_SEED_FILE,
    ).initialize();

    const jobs = new PostgresJobRepository(db, clock);
    const make = async (
      overrides: Partial<{
        title: string;
        companyName: string;
        location: string;
        category: string;
        level: JobLevel;
        salary: [number, number];
        skills: string[];
        postedDaysAgo: number;
        deadlineDays: number;
        status: JobStatus;
      }> = {},
    ) => {
      const id = await jobs.getNextId();
      const now = clock.utcNow.getTime();
      const props = {
        id,
        title: overrides.title ?? `Công việc ${id}`,
        companyId: 90 + (id % 3),
        company: new Company(
          90 + (id % 3),
          overrides.companyName ?? 'Công ty thử',
        ),
        salary: new SalaryRange(...(overrides.salary ?? [1000, 2000])),
        deadline: new Date(now + (overrides.deadlineDays ?? 20) * day),
        clock,
        location: overrides.location ?? 'Hà Nội',
        level: overrides.level ?? JobLevel.Middle,
        workMode: WorkMode.Hybrid,
        category: overrides.category ?? 'Lập trình Backend',
        postedAt: new Date(now - (overrides.postedDaysAgo ?? 1) * day),
        status: overrides.status ?? JobStatus.Published,
      };
      const job = Job.restore(props);
      (overrides.skills ?? []).forEach((skill) =>
        job.addSkill(new Skill(skill)),
      );
      await jobs.add(job);
    };

    await make({
      title: 'Giảm giá 100% cho nhân viên',
      skills: ['Excel'],
      postedDaysAgo: 2,
    });
    await make({
      title: 'Dev a_b tool',
      skills: ['Go'],
      postedDaysAgo: 3,
      salary: [3000, 6000],
    });
    await make({
      title: 'NESTJS Engineer',
      companyName: 'Zeta Labs',
      skills: ['NestJS', 'TypeScript', 'Docker'],
      level: JobLevel.Senior,
      salary: [2500, 4000],
      postedDaysAgo: 4,
    });
    await make({
      title: 'Kỹ sư Hạ tầng',
      location: 'Đà Nẵng',
      category: 'DevOps & Cloud',
      skills: ['kubernetes', 'AWS'],
      level: JobLevel.Lead,
      salary: [4000, 4000],
      postedDaysAgo: 5,
    });
    await make({
      title: 'Designer',
      location: 'TP. Hồ Chí Minh',
      category: 'Thiết kế sản phẩm',
      skills: ['Figma'],
      level: JobLevel.Junior,
      salary: [500, 900],
      postedDaysAgo: 6,
    });
    await make({
      title: 'Bản nháp không hiển thị',
      status: JobStatus.Draft,
      skills: ['Go'],
    });
    await make({
      title: 'Đã đóng không hiển thị',
      status: JobStatus.Closed,
      skills: ['Go'],
    });
    await make({
      title: 'Quá hạn không hiển thị',
      deadlineDays: -2,
      skills: ['Go'],
    });
    // Cùng ngày đăng và cùng lương: thứ tự phải ổn định theo id.
    await make({
      title: 'Trùng thời điểm A',
      postedDaysAgo: 7,
      salary: [1000, 2000],
    });
    await make({
      title: 'Trùng thời điểm B',
      postedDaysAgo: 7,
      salary: [1000, 2000],
    });
  }, 60_000);

  afterAll(async () => {
    await db.close();
    await testDatabase.drop();
  });

  const hasher = () => new Pbkdf2PasswordHasher();

  const cases: [string, Partial<JobSearchCriteria>][] = [
    ['không điều kiện', {}],
    [
      'từ khóa theo tên công ty (không phân biệt hoa thường)',
      { keyword: 'zeta' },
    ],
    ['từ khóa theo tiêu đề', { keyword: 'nestjs' }],
    ['từ khóa theo kỹ năng (chứa)', { keyword: 'kuber' }],
    ['từ khóa có dấu %', { keyword: '100%' }],
    ['từ khóa có dấu _ (không phải ký tự đại diện)', { keyword: 'a_b' }],
    ['từ khóa có dấu gạch chéo ngược', { keyword: 'a\\b' }],
    ['từ khóa không khớp', { keyword: 'khong-ton-tai' }],
    ['địa điểm có dấu', { location: 'đà nẵng' }],
    ['địa điểm viết hoa', { location: 'HÀ NỘI' }],
    ['địa điểm không dấu', { location: 'ha noi' }],
    ['địa điểm không dấu (đ)', { location: 'da nang' }],
    ['từ khóa không dấu theo tiêu đề', { keyword: 'ky su ha tang' }],
    ['từ khóa có dấu khớp tiêu đề có dấu', { keyword: 'KỸ SƯ' }],
    ['lĩnh vực không dấu', { category: 'thiet ke' }],
    ['kỹ năng không dấu', { skills: ['kubernetes'] }],
    ['lĩnh vực chứa chuỗi', { category: 'backend' }],
    ['cấp bậc', { level: JobLevel.Senior }],
    ['chỉ tin nổi bật', { featured: true }],
    ['chỉ tin thường', { featured: false }],
    ['lương tối thiểu', { minimumSalary: 2500 }],
    ['một kỹ năng (không phân biệt hoa thường)', { skills: ['kubernetes'] }],
    ['nhiều kỹ năng phải có đủ', { skills: ['nestjs', 'docker'] }],
    ['kỹ năng không đủ', { skills: ['nestjs', 'figma'] }],
    [
      'kết hợp nhiều điều kiện',
      {
        keyword: 'engineer',
        level: JobLevel.Senior,
        minimumSalary: 2000,
        skills: ['typescript'],
      },
    ],
    ['sắp xếp lương giảm dần', { sort: JobSortOrder.SalaryDescending }],
    ['phân trang trang 2', { page: 2, pageSize: 3 }],
    ['phân trang trang cuối lẻ', { page: 3, pageSize: 4 }],
    ['trang vượt quá dữ liệu vẫn có tổng', { page: 99, pageSize: 5 }],
  ];

  it.each(cases)('%s', async (_name, overrides) => {
    const criteria = { ...baseCriteria, ...overrides };
    const entities = await new PostgresJobRepository(db, clock).getAll();
    const expected = await new InMemoryJobSearchReader(
      new FakeJobRepository().seed(...entities),
    ).search(criteria);

    const actual = await new PostgresJobSearchReader(db, clock).search(
      criteria,
    );

    expect(actual.total).toBe(expected.total);
    expect(actual.items).toEqual(expected.items);
  });

  it('foldText (JS) và vn_fold (SQL) cho cùng kết quả', async () => {
    const samples = [
      'Hà Nội',
      'ĐÀ NẴNG',
      'đường Nguyễn Thị Minh Khai',
      'Thiết kế sản phẩm',
      'Lập trình Backend',
      'Phượng ơ ư ằ ẳ ẵ ặ',
      'CI/CD & DevOps',
      'C# / .NET',
    ];
    for (const sample of samples) {
      const { rows } = await db.query<{ folded: string }>(
        'SELECT vn_fold($1) AS folded',
        [sample],
      );
      expect(rows[0].folded).toBe(foldText(sample));
    }
  });

  it('đếm lĩnh vực giống bản in-memory', async () => {
    const entities = await new PostgresJobRepository(db, clock).getAll();
    const expected = await new InMemoryJobSearchReader(
      new FakeJobRepository().seed(...entities),
    ).categories();

    const actual = await new PostgresJobSearchReader(db, clock).categories();

    expect(actual).toEqual(expected);
    expect(actual.length).toBeGreaterThan(2);
  });

  it('chỉ trả tin Published còn hạn', async () => {
    const { items } = await new PostgresJobSearchReader(db, clock).search(
      baseCriteria,
    );

    expect(items.some((job) => /không hiển thị/.test(job.title))).toBe(false);
    expect(items.length).toBeGreaterThan(5);
  });
});
