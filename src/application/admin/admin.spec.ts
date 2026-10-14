import { makeNotifier } from '../../testing/test-helpers';
import {
  ArgumentError,
  ApplicationStatus,
  Company,
  CompanyStatus,
  Employer,
  JobManagementForbiddenException,
  JobStatus,
} from '../../domain';
import { InMemoryCandidateFileRepository } from '../../infrastructure/persistence/in-memory-candidate-file-repository';
import { InMemoryAdminReader } from '../../infrastructure/persistence/in-memory-admin-reader';
import { InMemoryAuditLogRepository } from '../../infrastructure/persistence/in-memory-audit-log-repository';
import { InMemoryCandidateRepository } from '../../infrastructure/persistence/in-memory-candidate-repository';
import { InMemoryCompanyRepository } from '../../infrastructure/persistence/in-memory-company-repository';
import { InMemoryJobApplicationRepository } from '../../infrastructure/persistence/in-memory-job-application-repository';
import { InMemoryJobSearchReader } from '../../infrastructure/persistence/in-memory-job-search-reader';
import { InMemoryRefreshTokenRepository } from '../../infrastructure/persistence/in-memory-refresh-token-repository';
import { InMemoryUserAccountRepository } from '../../infrastructure/persistence/in-memory-user-account-repository';
import { Pbkdf2PasswordHasher } from '../../infrastructure/auth/pbkdf2-password-hasher';
import { SecureRefreshTokenGenerator } from '../../infrastructure/auth/secure-refresh-token-generator';
import {
  FakeJobRepository,
  makeJob,
  MutableClock,
} from '../../testing/test-helpers';
import { ApplicationService } from '../applications/application.service';
import { AccountRole } from '../auth';
import { ResourceNotFoundException } from '../exceptions';
import { JobDetailService } from '../jobs/job-detail.service';
import { JobManagementService } from '../jobs/job-management.service';
import { JobSearchService } from '../jobs/job-search.service';
import { AdminModerationService } from './admin-moderation.service';
import { AdminQueryService } from './admin-query.service';

const admin = { id: 100, name: 'Quản trị viên' };

async function setup() {
  const clock = new MutableClock();
  const jobs = new FakeJobRepository();
  const companies = new InMemoryCompanyRepository();
  await companies.add(new Company(1, 'Nova Technology', 'TP. Hồ Chí Minh'));
  await companies.add(new Company(30, 'ABC', 'Hà Nội'));
  await companies.add(new Company(31, 'Công ty Khác'));
  const candidates = new InMemoryCandidateRepository(true);
  const accounts = await InMemoryUserAccountRepository.createWithDemoData(
    new Pbkdf2PasswordHasher(),
    candidates,
    companies,
  );
  const applications = new InMemoryJobApplicationRepository();
  const refreshTokens = new InMemoryRefreshTokenRepository();
  const audit = new InMemoryAuditLogRepository();
  jobs.seed(
    makeJob(clock, { id: 1, companyId: 30, title: 'Backend', skills: ['C#'] }),
    makeJob(clock, { id: 2, companyId: 30, title: 'Draft', publish: false }),
    makeJob(clock, { id: 3, companyId: 31, title: 'Designer' }),
  );

  return {
    clock,
    jobs,
    companies,
    accounts,
    applications,
    refreshTokens,
    audit,
    moderation: new AdminModerationService(
      jobs,
      companies,
      accounts,
      accounts,
      refreshTokens,
      audit,
      clock,
      makeNotifier(),
    ),
    queries: new AdminQueryService(
      new InMemoryAdminReader(jobs, applications, companies, accounts),
      audit,
    ),
    search: new JobSearchService(new InMemoryJobSearchReader(jobs)),
    detail: new JobDetailService(jobs),
    management: new JobManagementService(
      jobs,
      applications,
      companies,
      clock,
      makeNotifier(),
    ),
    apply: new ApplicationService(
      jobs,
      applications,
      clock,
      makeNotifier(),
      new InMemoryCandidateFileRepository(applications),
    ),
  };
}

const employerOf = (companyId: number) =>
  new Employer(
    1,
    'Bình',
    'b@x.vn',
    new Company(companyId, `Công ty ${companyId}`),
  );

describe('AdminModerationService - tin tuyển dụng', () => {
  it('gỡ tin: biến mất khỏi tìm kiếm và công khai, không ứng tuyển được, ghi nhật ký', async () => {
    const s = await setup();

    const result = await s.moderation.takeDownJob(
      admin,
      1,
      ' Quảng cáo lừa đảo ',
    );

    expect(result).toEqual({
      id: 1,
      status: JobStatus.Removed,
      removalReason: 'Quảng cáo lừa đảo',
    });
    expect((await s.search.search({})).items.map((job) => job.id)).toEqual([3]);
    await expect(s.detail.getById(1)).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
    await expect(s.apply.apply(20, 1)).rejects.toThrow('đóng');
    expect((await s.audit.list(1, 10)).items).toEqual([
      expect.objectContaining({
        actorId: 100,
        action: 'JobTakenDown',
        targetType: 'Job',
        targetId: 1,
        detail: 'Quảng cáo lừa đảo',
      }),
    ]);
  });

  it('nhà tuyển dụng thấy lý do nhưng không sửa/đăng được tin bị gỡ; khôi phục về bản nháp', async () => {
    const s = await setup();
    await s.moderation.takeDownJob(admin, 1, 'Vi phạm');

    const detail = await s.management.getDetail(1, employerOf(30));
    expect(detail).toMatchObject({
      status: JobStatus.Removed,
      removalReason: 'Vi phạm',
    });
    await expect(s.management.publish(1, employerOf(30))).rejects.toThrow();

    const restored = await s.moderation.reinstateJob(admin, 1);
    expect(restored).toEqual({
      id: 1,
      status: JobStatus.Draft,
      removalReason: null,
    });
    await expect(
      s.management.publish(1, employerOf(30)),
    ).resolves.toMatchObject({
      status: JobStatus.Published,
    });
  });

  it('báo lỗi khi tin không tồn tại, thiếu lý do hoặc khôi phục tin chưa bị gỡ', async () => {
    const s = await setup();

    await expect(
      s.moderation.takeDownJob(admin, 99, 'x'),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
    await expect(
      s.moderation.takeDownJob(admin, 1, '  '),
    ).rejects.toBeInstanceOf(ArgumentError);
    await expect(s.moderation.reinstateJob(admin, 1)).rejects.toThrow(
      'không ở trạng thái bị gỡ',
    );
    expect((await s.audit.list(1, 10)).total).toBe(0);
  });
});

describe('AdminModerationService - công ty', () => {
  it('khóa công ty ẩn mọi tin của công ty, chặn đăng tin; mở khóa trả lại', async () => {
    const s = await setup();

    const result = await s.moderation.suspendCompany(
      admin,
      30,
      'Lừa đảo ứng viên',
    );

    expect(result).toEqual({
      id: 30,
      status: CompanyStatus.Suspended,
      suspensionReason: 'Lừa đảo ứng viên',
    });
    expect((await s.search.search({})).items.map((job) => job.id)).toEqual([3]);
    await expect(s.detail.getById(1)).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
    await expect(s.apply.apply(20, 1)).rejects.toThrow();
    await expect(
      s.management.publish(2, employerOf(30)),
    ).rejects.toBeInstanceOf(JobManagementForbiddenException);

    const reactivated = await s.moderation.reactivateCompany(admin, 30);
    expect(reactivated).toEqual({
      id: 30,
      status: CompanyStatus.Active,
      suspensionReason: null,
    });
    expect(
      (await s.search.search({})).items.map((job) => job.id).sort(),
    ).toEqual([1, 3]);
    const actions = (await s.audit.list(1, 10)).items.map(
      (entry) => entry.action,
    );
    expect(actions).toEqual(['CompanyReactivated', 'CompanySuspended']);
  });

  it('khóa lại công ty đã khóa hoặc mở khóa công ty đang hoạt động bị từ chối', async () => {
    const s = await setup();

    await expect(s.moderation.reactivateCompany(admin, 30)).rejects.toThrow();
    await s.moderation.suspendCompany(admin, 30, 'Vi phạm');
    await expect(
      s.moderation.suspendCompany(admin, 30, 'Lần nữa'),
    ).rejects.toThrow();
    await expect(
      s.moderation.suspendCompany(admin, 99, 'x'),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
  });
});

describe('AdminModerationService - tài khoản', () => {
  it('khóa tài khoản thu hồi mọi phiên; mở khóa; có nhật ký', async () => {
    const s = await setup();
    const issued = new SecureRefreshTokenGenerator(
      s.clock,
      86_400_000,
    ).generate(20);
    await s.refreshTokens.add(issued.session);

    await expect(s.moderation.disableUser(admin, 20)).resolves.toEqual({
      id: 20,
      disabled: true,
    });

    expect((await s.accounts.findById(20))!.disabled).toBe(true);
    expect(
      (await s.refreshTokens.findByHash(issued.session.tokenHash))!.revokedAt,
    ).not.toBeNull();
    await expect(s.moderation.enableUser(admin, 20)).resolves.toEqual({
      id: 20,
      disabled: false,
    });
    expect((await s.accounts.findById(20))!.disabled).toBe(false);
    expect((await s.audit.list(1, 10)).items.map((e) => e.action)).toEqual([
      'UserEnabled',
      'UserDisabled',
    ]);
  });

  it('không khóa chính mình, quản trị viên khác hoặc tài khoản không tồn tại', async () => {
    const s = await setup();

    await expect(s.moderation.disableUser(admin, 100)).rejects.toBeInstanceOf(
      ArgumentError,
    );
    await expect(
      s.moderation.disableUser({ id: 7, name: 'Admin 2' }, 100),
    ).rejects.toThrow('quản trị viên');
    await expect(s.moderation.disableUser(admin, 9999)).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
    await expect(s.moderation.enableUser(admin, 9999)).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
  });
});

describe('AdminQueryService', () => {
  it('thống kê toàn hệ thống', async () => {
    const s = await setup();
    await s.apply.apply(20, 1);
    await s.moderation.takeDownJob(admin, 3, 'Vi phạm');

    expect(await s.queries.stats()).toEqual({
      users: { candidates: 1, employers: 1, admins: 1 },
      companies: { active: 3, suspended: 0 },
      jobs: { draft: 1, published: 1, closed: 0, removed: 1 },
      applications: 1,
    });
  });

  it('liệt kê tin ở mọi trạng thái, lọc theo trạng thái/công ty/từ khóa không dấu, có đếm đơn', async () => {
    const s = await setup();
    await s.apply.apply(20, 1);

    const all = await s.queries.jobs({});
    expect(all.items.map((job) => job.id)).toEqual([3, 2, 1]);
    expect(all.toJSON()).toMatchObject({ totalItems: 3, totalPages: 1 });
    expect(all.items.find((job) => job.id === 1)).toMatchObject({
      applications: 1,
      company: 'Công ty 30', // bản chụp công ty đi kèm tin do makeJob dựng
    });

    expect(
      (await s.queries.jobs({ status: JobStatus.Draft })).items.map(
        (j) => j.id,
      ),
    ).toEqual([2]);
    expect(
      (await s.queries.jobs({ companyId: 31 })).items.map((j) => j.id),
    ).toEqual([3]);
    expect(
      (await s.queries.jobs({ keyword: ' DESIGNER ' })).items.map((j) => j.id),
    ).toEqual([3]);
    expect(
      (await s.queries.jobs({ page: 2, pageSize: 2 })).items.map((j) => j.id),
    ).toEqual([1]);
  });

  it('liệt kê công ty và tài khoản với bộ lọc', async () => {
    const s = await setup();
    await s.moderation.suspendCompany(admin, 31, 'Vi phạm');
    await s.moderation.disableUser(admin, 20);

    const companies = await s.queries.companies({
      status: CompanyStatus.Suspended,
    });
    expect(companies.items).toEqual([
      expect.objectContaining({
        id: 31,
        name: 'Công ty Khác',
        jobs: 1,
        members: 0,
        suspensionReason: 'Vi phạm',
      }),
    ]);
    expect(
      (await s.queries.companies({ keyword: 'abc' })).items.map((c) => c.id),
    ).toEqual([30]);
    expect(
      (await s.queries.companies({})).items.find((c) => c.id === 1),
    ).toMatchObject({ members: 1 });

    const users = await s.queries.users({ disabled: true });
    expect(users.items.map((u) => u.id)).toEqual([20]);
    expect(
      (await s.queries.users({ role: AccountRole.Employer })).items[0],
    ).toMatchObject({
      companyId: 1,
      companyName: 'Nova Technology',
    });
    expect(
      (await s.queries.users({ keyword: 'ADMIN@jobboard' })).items.map(
        (u) => u.id,
      ),
    ).toEqual([100]);
  });

  it('kiểm tra tham số phân trang', async () => {
    const s = await setup();

    await expect(s.queries.jobs({ page: 0 })).rejects.toBeInstanceOf(
      ArgumentError,
    );
    await expect(s.queries.users({ pageSize: 101 })).rejects.toBeInstanceOf(
      ArgumentError,
    );
  });

  it('nhật ký mới nhất trước, có phân trang', async () => {
    const s = await setup();
    await s.moderation.takeDownJob(admin, 1, 'A');
    s.clock.advanceDays(1);
    await s.moderation.takeDownJob(admin, 3, 'B');

    const page = await s.queries.auditLogs({ pageSize: 1 });

    expect(page.items.map((entry) => entry.targetId)).toEqual([3]);
    expect(page.toJSON()).toMatchObject({ totalItems: 2, totalPages: 2 });
  });
});

describe('Ứng viên đã ứng tuyển vẫn thấy lịch sử khi tin bị gỡ', () => {
  it('đơn không bị xóa và trạng thái giữ nguyên', async () => {
    const s = await setup();
    const application = await s.apply.apply(20, 1);

    await s.moderation.takeDownJob(admin, 1, 'Vi phạm');

    expect((await s.applications.getById(application.id))!.status).toBe(
      ApplicationStatus.Submitted,
    );
  });
});
