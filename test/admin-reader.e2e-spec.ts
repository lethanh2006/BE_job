import {
  AdminReader,
  AuditLogRepository,
} from '../src/application/abstractions/admin';
import {
  AccountRegistrationRepository,
  AccountSecurityRepository,
  EmployerRegistrationRepository,
} from '../src/application/abstractions/authentication';
import {
  CandidateRepository,
  CompanyRepository,
  JobApplicationRepository,
  JobRepository,
} from '../src/application/abstractions/persistence';
import { AccountRole } from '../src/application/auth';
import { foldText } from '../src/application/common/text-folding';
import {
  Candidate,
  Company,
  Job,
  JobApplication,
  JobLevel,
  JobStatus,
  SalaryRange,
  Skill,
  SystemClock,
  WorkMode,
} from '../src/domain';
import { Pbkdf2PasswordHasher } from '../src/infrastructure/auth/pbkdf2-password-hasher';
import { InMemoryAdminReader } from '../src/infrastructure/persistence/in-memory-admin-reader';
import { InMemoryAuditLogRepository } from '../src/infrastructure/persistence/in-memory-audit-log-repository';
import { InMemoryCandidateRepository } from '../src/infrastructure/persistence/in-memory-candidate-repository';
import { InMemoryCompanyRepository } from '../src/infrastructure/persistence/in-memory-company-repository';
import { InMemoryJobApplicationRepository } from '../src/infrastructure/persistence/in-memory-job-application-repository';
import { InMemoryJobRepository } from '../src/infrastructure/persistence/in-memory-job-repository';
import { InMemoryUserAccountRepository } from '../src/infrastructure/persistence/in-memory-user-account-repository';
import { Database } from '../src/infrastructure/postgres/database';
import { DatabaseInitializer } from '../src/infrastructure/postgres/database-initializer';
import { PostgresAdminReader } from '../src/infrastructure/postgres/postgres-admin-reader';
import { PostgresAuditLogRepository } from '../src/infrastructure/postgres/postgres-audit-log-repository';
import { PostgresCandidateRepository } from '../src/infrastructure/postgres/postgres-candidate-repository';
import { PostgresCompanyRepository } from '../src/infrastructure/postgres/postgres-company-repository';
import { PostgresJobApplicationRepository } from '../src/infrastructure/postgres/postgres-job-application-repository';
import { PostgresJobRepository } from '../src/infrastructure/postgres/postgres-job-repository';
import { PostgresUserAccountRepository } from '../src/infrastructure/postgres/postgres-user-account-repository';
import { JOB_SEED_FILE } from '../src/infrastructure/seed/paths';
import {
  createTestDatabase,
  E2E_POSTGRES_URL,
} from './support/postgres-test-database';

const describeWithPostgres = E2E_POSTGRES_URL ? describe : describe.skip;
const day = 86_400_000;

interface World {
  jobs: JobRepository;
  companies: CompanyRepository;
  candidates: CandidateRepository;
  applications: JobApplicationRepository;
  accounts: AccountRegistrationRepository &
    EmployerRegistrationRepository &
    AccountSecurityRepository;
  audit: AuditLogRepository;
  reader: AdminReader;
  close(): Promise<void>;
}

async function inMemoryWorld(): Promise<World> {
  const clock = new SystemClock();
  const jobs = new InMemoryJobRepository(JOB_SEED_FILE, clock);
  const companies = new InMemoryCompanyRepository(JOB_SEED_FILE);
  const candidates = new InMemoryCandidateRepository(true);
  const applications = new InMemoryJobApplicationRepository(true);
  const accounts = await InMemoryUserAccountRepository.createWithDemoData(
    new Pbkdf2PasswordHasher(),
    candidates,
    companies,
  );

  return {
    jobs,
    companies,
    candidates,
    applications,
    accounts,
    audit: new InMemoryAuditLogRepository(),
    reader: new InMemoryAdminReader(jobs, applications, companies, accounts),
    close: () => Promise.resolve(),
  };
}

async function postgresWorld(): Promise<World> {
  const clock = new SystemClock();
  const database = await createTestDatabase(E2E_POSTGRES_URL!);
  const db = Database.connect(database.url, 5);
  await new DatabaseInitializer(
    db,
    clock,
    new Pbkdf2PasswordHasher(),
    JOB_SEED_FILE,
  ).initialize();
  const accounts = new PostgresUserAccountRepository(db);

  return {
    jobs: new PostgresJobRepository(db, clock),
    companies: new PostgresCompanyRepository(db),
    candidates: new PostgresCandidateRepository(db),
    applications: new PostgresJobApplicationRepository(db),
    accounts,
    audit: new PostgresAuditLogRepository(db),
    reader: new PostgresAdminReader(db),
    close: async () => {
      await db.close();
      await database.drop();
    },
  };
}

/** Cùng một kịch bản thao tác trên mọi provider, để so khớp kết quả đọc của trang quản trị. */
async function applyScenario(world: World, now: number) {
  const clock = new SystemClock();

  const companies = [
    new Company(await world.companies.getNextId(), 'Alpha Công Nghệ', 'Hà Nội'),
    new Company(await world.companies.getNextId(), 'Beta Đà Lạt', 'Đà Lạt'),
    new Company(await world.companies.getNextId(), 'Gamma Studio'),
  ];
  for (const company of companies) await world.companies.add(company);
  const [alpha, beta, gamma] = companies;

  const employerCompany = new Company(
    await world.companies.getNextId(),
    'Delta Tuyển Dụng',
  );
  await world.accounts.registerEmployer(
    {
      id: await world.accounts.getNextUserId(),
      name: 'Nguyễn Chủ Delta',
      email: 'delta@example.com',
      passwordHash: 'hash',
      role: AccountRole.Employer,
      companyId: employerCompany.id,
    },
    employerCompany,
  );
  const candidateIds: number[] = [];
  for (const [name, email] of [
    ['Trần Ứng Viên', 'ungvien1@example.com'],
    ['Lê Thị Đào', 'ungvien2@example.com'],
  ]) {
    const id = await world.accounts.getNextUserId();
    candidateIds.push(id);
    await world.accounts.registerCandidate(
      { id, name, email, passwordHash: 'hash', role: AccountRole.Candidate },
      new Candidate(id, name, email),
    );
  }

  const makeJob = async (
    company: Company,
    title: string,
    status: JobStatus,
    skills: string[],
    postedDaysAgo: number,
  ) => {
    const job = Job.restore({
      id: await world.jobs.getNextId(),
      title,
      companyId: company.id,
      company,
      salary: new SalaryRange(1000, 2000),
      deadline: new Date(now + 20 * day),
      clock,
      location: 'HN',
      level: JobLevel.Middle,
      workMode: WorkMode.Remote,
      category: 'IT',
      postedAt: new Date(now - postedDaysAgo * day),
      status: JobStatus.Draft,
    });
    skills.forEach((skill) => job.addSkill(new Skill(skill)));
    if (status === JobStatus.Published || status === JobStatus.Closed)
      job.publish();
    if (status === JobStatus.Closed) job.close();
    if (status === JobStatus.Removed) job.takeDown('Vi phạm điều khoản');
    await world.jobs.add(job);
    return job;
  };

  const published = await makeJob(
    alpha,
    'Kỹ sư phần mềm',
    JobStatus.Published,
    ['TypeScript'],
    1,
  );
  await makeJob(alpha, 'Bản nháp của Alpha', JobStatus.Draft, [], 2);
  await makeJob(beta, 'Đầu bếp Đà Lạt', JobStatus.Closed, ['Nấu ăn'], 3);
  await makeJob(beta, 'Tin vi phạm', JobStatus.Removed, ['Lừa đảo'], 4);
  await makeJob(gamma, 'Thiết kế đồ họa', JobStatus.Published, ['Figma'], 5);
  await makeJob(
    employerCompany,
    'Tuyển dụng viên',
    JobStatus.Published,
    ['Giao tiếp'],
    6,
  );

  await world.applications.add(
    new JobApplication(
      await world.applications.getNextId(),
      published.id,
      candidateIds[0],
      new Date(now - day),
    ),
  );
  await world.applications.add(
    new JobApplication(
      await world.applications.getNextId(),
      published.id,
      candidateIds[1],
      new Date(now - 2 * day),
    ),
  );

  // Kiểm duyệt: khóa công ty Gamma và một tài khoản ứng viên.
  gamma.suspend('Nghi ngờ lừa đảo');
  await world.companies.update(gamma);
  await world.jobs.updateCompanySnapshot(gamma);
  await world.accounts.setDisabled(candidateIds[1], true);

  const at = (offsetDays: number) => new Date(now - offsetDays * day);
  await world.audit.add({
    actorId: 100,
    actorName: 'Quản trị viên',
    action: 'CompanySuspended',
    targetType: 'Company',
    targetId: gamma.id,
    detail: 'Nghi ngờ lừa đảo',
    createdAt: at(2),
  });
  await world.audit.add({
    actorId: 100,
    actorName: 'Quản trị viên',
    action: 'UserDisabled',
    targetType: 'User',
    targetId: candidateIds[1],
    detail: null,
    createdAt: at(1),
  });
}

describeWithPostgres('Trang quản trị: PostgreSQL khớp bản in-memory', () => {
  let memory: World;
  let postgres: World;

  beforeAll(async () => {
    [memory, postgres] = await Promise.all([inMemoryWorld(), postgresWorld()]);
    // Cùng một mốc thời gian cho cả hai thế giới để các cột ngày giờ so khớp từng mili giây.
    const now = Date.now();
    await Promise.all([
      applyScenario(memory, now),
      applyScenario(postgres, now),
    ]);
  }, 120_000);

  afterAll(async () => {
    await Promise.all([memory.close(), postgres.close()]);
  });

  const paging = { page: 1, pageSize: 50 };
  const folded = (value: string) => foldText(value);

  it('thống kê', async () => {
    const [expected, actual] = await Promise.all([
      memory.reader.stats(),
      postgres.reader.stats(),
    ]);

    expect(actual).toEqual(expected);
    expect(actual.jobs.removed).toBe(1);
    expect(actual.companies.suspended).toBe(1);
  });

  it.each([
    ['không điều kiện', {}],
    ['theo trạng thái Published', { status: JobStatus.Published }],
    ['theo trạng thái Removed', { status: JobStatus.Removed }],
    ['theo công ty', { companyId: 101 }],
    ['từ khóa tiêu đề không dấu', { keyword: folded('ky su phan mem') }],
    ['từ khóa tên công ty', { keyword: folded('ĐÀ LẠT') }],
    ['từ khóa kỹ năng', { keyword: folded('figma') }],
    ['kết hợp', { keyword: folded('alpha'), status: JobStatus.Draft }],
    ['trang 2', { page: 2, pageSize: 4 }],
    ['trang vượt quá dữ liệu', { page: 50, pageSize: 5 }],
  ])('tin: %s', async (_name, criteria) => {
    const c = { ...paging, ...criteria };
    const [expected, actual] = await Promise.all([
      memory.reader.searchJobs(c),
      postgres.reader.searchJobs(c),
    ]);

    expect(actual).toEqual(expected);
  });

  it.each([
    ['không điều kiện', {}],
    ['đang hoạt động', { status: 'Active' as never }],
    ['bị khóa', { status: 'Suspended' as never }],
    ['từ khóa không dấu', { keyword: folded('da lat') }],
    ['từ khóa không khớp', { keyword: 'khong-co' }],
    ['phân trang', { page: 2, pageSize: 3 }],
  ])('công ty: %s', async (_name, criteria) => {
    const c = { ...paging, ...criteria };
    const [expected, actual] = await Promise.all([
      memory.reader.searchCompanies(c),
      postgres.reader.searchCompanies(c),
    ]);

    expect(actual).toEqual(expected);
  });

  it.each([
    ['không điều kiện', {}],
    ['ứng viên', { role: AccountRole.Candidate }],
    ['nhà tuyển dụng', { role: AccountRole.Employer }],
    ['bị khóa', { disabled: true }],
    ['đang hoạt động', { disabled: false }],
    ['từ khóa tên không dấu', { keyword: folded('le thi dao') }],
    ['từ khóa email', { keyword: 'ungvien1@' }],
    ['phân trang', { page: 2, pageSize: 2 }],
  ])('tài khoản: %s', async (_name, criteria) => {
    const c = { ...paging, ...criteria };
    const [expected, actual] = await Promise.all([
      memory.reader.searchUsers(c),
      postgres.reader.searchUsers(c),
    ]);

    expect(actual).toEqual(expected);
  });

  it('nhật ký thao tác', async () => {
    const [expected, actual] = await Promise.all([
      memory.audit.list(1, 10),
      postgres.audit.list(1, 10),
    ]);

    expect(actual).toEqual(expected);
    expect(actual.items.map((entry) => entry.action)).toEqual([
      'UserDisabled',
      'CompanySuspended',
    ]);
    expect(
      (await postgres.audit.list(2, 1)).items.map((entry) => entry.action),
    ).toEqual(['CompanySuspended']);
  });

  it('tin của công ty bị khóa bị ẩn khỏi tìm kiếm công khai ở cả hai provider', async () => {
    const memoryJobs = await memory.jobs.getByCompanyId(102);
    const pgJobs = await postgres.jobs.getByCompanyId(102);

    expect(memoryJobs.map((job) => job.isPubliclyVisible)).toEqual([false]);
    expect(pgJobs.map((job) => job.isPubliclyVisible)).toEqual([false]);
  });
});
