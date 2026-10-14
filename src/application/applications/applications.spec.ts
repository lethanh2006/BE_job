import { makeNotifier } from '../../testing/test-helpers';
import {
  AdminUser,
  AlreadyAppliedException,
  ApplicationStatus,
  Candidate,
  Company,
  Employer,
  JobClosedException,
  JobManagementForbiddenException,
  SalaryRange,
  Skill,
} from '../../domain';
import { InMemoryCandidateFileRepository } from '../../infrastructure/persistence/in-memory-candidate-file-repository';
import { InMemoryCandidateRepository } from '../../infrastructure/persistence/in-memory-candidate-repository';
import { InMemoryJobApplicationRepository } from '../../infrastructure/persistence/in-memory-job-application-repository';
import {
  FakeJobRepository,
  makeJob,
  MutableClock,
} from '../../testing/test-helpers';
import { ResourceNotFoundException } from '../exceptions';
import { JobMatchService } from '../matching/job-match.service';
import { ApplicationQueryService } from './application-query.service';
import { ApplicationService } from './application.service';

describe('ApplicationService', () => {
  const clock = new MutableClock();
  let jobs: FakeJobRepository;
  let applications: InMemoryJobApplicationRepository;
  let service: ApplicationService;

  beforeEach(() => {
    jobs = new FakeJobRepository();
    applications = new InMemoryJobApplicationRepository();
    service = new ApplicationService(
      jobs,
      applications,
      clock,
      makeNotifier(),
      new InMemoryCandidateFileRepository(applications),
    );
  });

  it('ứng tuyển tin đang đăng tạo đơn Submitted và lưu lại', async () => {
    jobs.seed(makeJob(clock, { id: 1 }));

    const application = await service.apply(20, 1);

    expect(application).toMatchObject({
      jobId: 1,
      candidateId: 20,
      status: ApplicationStatus.Submitted,
    });
    expect(application.appliedAt).toEqual(clock.utcNow);
    expect(await applications.hasApplied(20, 1)).toBe(true);
  });

  it('từ chối tin nháp, tin hết hạn, tin không tồn tại và nộp trùng', async () => {
    const expiringClock = new MutableClock();
    jobs.seed(
      makeJob(clock, { id: 1, publish: false }),
      makeJob(expiringClock, { id: 2 }),
      makeJob(clock, { id: 3 }),
    );
    expiringClock.advanceDays(8);

    await expect(service.apply(20, 1)).rejects.toBeInstanceOf(
      JobClosedException,
    );
    await expect(service.apply(20, 2)).rejects.toBeInstanceOf(
      JobClosedException,
    );
    await expect(service.apply(20, 99)).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );

    await service.apply(20, 3);
    await expect(service.apply(20, 3)).rejects.toBeInstanceOf(
      AlreadyAppliedException,
    );
  });

  describe('changeStatus', () => {
    const employerOf = (companyId: number) =>
      new Employer(1, 'Bình', 'b@x.vn', new Company(companyId, 'X'));

    beforeEach(async () => {
      jobs.seed(makeJob(clock, { id: 1, companyId: 30 }));
      await service.apply(20, 1);
    });

    it('employer đúng công ty và admin được đổi trạng thái', async () => {
      const byEmployer = await service.changeStatus(
        1,
        ApplicationStatus.Reviewing,
        employerOf(30),
      );
      expect(byEmployer.status).toBe(ApplicationStatus.Reviewing);

      const byAdmin = await service.changeStatus(
        1,
        ApplicationStatus.Accepted,
        new AdminUser(100, 'Admin', 'a@x.vn'),
      );
      expect(byAdmin.status).toBe(ApplicationStatus.Accepted);
      expect((await applications.getById(1))!.status).toBe(
        ApplicationStatus.Accepted,
      );
    });

    it('employer công ty khác bị từ chối và đơn không đổi', async () => {
      await expect(
        service.changeStatus(1, ApplicationStatus.Accepted, employerOf(99)),
      ).rejects.toBeInstanceOf(JobManagementForbiddenException);
      expect((await applications.getById(1))!.status).toBe(
        ApplicationStatus.Submitted,
      );
    });

    it('đơn không tồn tại báo không tìm thấy', async () => {
      await expect(
        service.changeStatus(404, ApplicationStatus.Accepted, employerOf(30)),
      ).rejects.toBeInstanceOf(ResourceNotFoundException);
    });
  });
});

describe('ApplicationQueryService', () => {
  const clock = new MutableClock();

  it('trả đơn của ứng viên kèm tên tin/công ty, mới nhất trước; chỉ lấy đơn của công ty', async () => {
    const jobs = new FakeJobRepository().seed(
      makeJob(clock, { id: 1, title: 'A', companyId: 30 }),
      makeJob(clock, { id: 2, title: 'B', companyId: 31 }),
    );
    const applications = new InMemoryJobApplicationRepository();
    const candidates = new InMemoryCandidateRepository();
    await candidates.add(new Candidate(20, 'Nguyễn An', 'an@x.vn'));
    const service = new ApplicationQueryService(
      jobs,
      applications,
      candidates,
      new JobMatchService(),
      new InMemoryCandidateFileRepository(applications),
    );
    const apply = new ApplicationService(
      jobs,
      applications,
      clock,
      makeNotifier(),
      new InMemoryCandidateFileRepository(applications),
    );
    await apply.apply(20, 1);
    clock.advanceDays(1);
    await apply.apply(20, 2);
    await apply.apply(21, 2);

    const mine = await service.getByCandidateId(20);
    expect(mine.map((a) => a.jobTitle)).toEqual(['B', 'A']);
    expect(mine[0]).toMatchObject({
      candidateName: 'Nguyễn An',
      company: 'Công ty 31',
    });

    const company = await service.getByCompanyId(31);
    expect(company.map((a) => a.candidateName).sort()).toEqual([
      'Nguyễn An',
      'Ứng viên #21',
    ]);
  });
});

describe('ApplicationQueryService - phía nhà tuyển dụng', () => {
  const clock = new MutableClock();

  async function setup() {
    const jobs = new FakeJobRepository().seed(
      makeJob(clock, {
        id: 1,
        companyId: 30,
        skills: ['C#', 'Docker'],
        salary: [1000, 2000],
      }),
      makeJob(clock, { id: 2, companyId: 31 }),
    );
    const applications = new InMemoryJobApplicationRepository();
    const candidates = new InMemoryCandidateRepository();
    const candidate = new Candidate(
      20,
      'Nguyễn An',
      'an@x.vn',
      'bio',
      new SalaryRange(1500, 2500),
    );
    candidate.addSkill(new Skill('C#'));
    await candidates.add(candidate);
    await new ApplicationService(
      jobs,
      applications,
      clock,
      makeNotifier(),
      new InMemoryCandidateFileRepository(applications),
    ).apply(20, 1);
    await new ApplicationService(
      jobs,
      applications,
      clock,
      makeNotifier(),
      new InMemoryCandidateFileRepository(applications),
    ).apply(20, 2);

    return {
      service: new ApplicationQueryService(
        jobs,
        applications,
        candidates,
        new JobMatchService(),
        new InMemoryCandidateFileRepository(applications),
      ),
    };
  }

  it('danh sách của công ty chỉ gồm đơn vào tin của công ty và có điểm phù hợp', async () => {
    const { service } = await setup();

    const list = await service.getByCompanyId(30);

    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      jobId: 1,
      candidateName: 'Nguyễn An',
      matchScore: 65,
    });
  });

  it('xem hồ sơ ứng viên: kỹ năng khớp/thiếu; đơn của công ty khác trả 404', async () => {
    const { service } = await setup();

    const detail = await service.getApplicant(30, 1);

    expect(detail.candidate).toMatchObject({
      id: 20,
      name: 'Nguyễn An',
      skills: ['C#'],
    });
    expect(detail).toMatchObject({
      matchedSkills: ['C#'],
      missingSkills: ['Docker'],
      salaryFit: true,
      application: { matchScore: 65 },
    });
    await expect(service.getApplicant(31, 1)).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
    await expect(service.getApplicant(30, 99)).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
  });
});
