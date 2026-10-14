import { JobLevel, JobManagementForbiddenException } from '../../domain';
import { Company, Employer, Skill, JobStatus } from '../../domain';
import { InMemoryJobApplicationRepository } from '../../infrastructure/persistence/in-memory-job-application-repository';
import {
  FakeJobRepository,
  makeJob,
  MutableClock,
} from '../../testing/test-helpers';
import { ResourceNotFoundException } from '../exceptions';
import { JobSortOrder } from './dto';
import { JobDetailService } from './job-detail.service';
import { JobManagementService } from './job-management.service';
import { JobSearchService } from './job-search.service';

describe('JobSearchService', () => {
  const clock = new MutableClock();
  let jobs: FakeJobRepository;
  let service: JobSearchService;

  beforeEach(() => {
    jobs = new FakeJobRepository();
    service = new JobSearchService(jobs);
  });

  it('lọc theo trạng thái, từ khóa, mức lương và kỹ năng', async () => {
    jobs.seed(
      makeJob(clock, {
        id: 1,
        title: 'Senior Backend Developer',
        salary: [1500, 2500],
        skills: ['C#', 'PostgreSQL'],
      }),
      makeJob(clock, {
        id: 2,
        title: 'Junior Backend Developer',
        salary: [800, 1200],
        skills: ['C#'],
      }),
      makeJob(clock, {
        id: 3,
        title: 'Frontend Developer',
        salary: [1800, 2800],
        skills: ['TypeScript'],
      }),
      makeJob(clock, {
        id: 4,
        title: 'Backend Architect',
        salary: [3000, 5000],
        skills: ['C#'],
        publish: false,
      }),
    );

    const result = await service.search({
      keyword: ' backend ',
      minimumSalary: 1000,
      skills: [' c# '],
    });

    expect(result.items.map((job) => job.id)).toEqual([1]);
    expect(result.items[0].skills).toEqual(['C#', 'PostgreSQL']);
    expect(result.toJSON()).toMatchObject({ totalItems: 1, totalPages: 1 });
  });

  it('sắp xếp theo lương tối đa giảm dần và phân trang', async () => {
    jobs.seed(
      makeJob(clock, { id: 1, salary: [1000, 2000] }),
      makeJob(clock, { id: 2, salary: [1000, 3000] }),
      makeJob(clock, { id: 3, salary: [1000, 1000] }),
    );

    const result = await service.search({
      page: 2,
      pageSize: 1,
      sort: JobSortOrder.SalaryDescending,
    });

    expect(result.items.map((job) => job.id)).toEqual([1]);
    expect(result.toJSON()).toMatchObject({ totalItems: 3, totalPages: 3 });
  });

  it('loại bỏ tin đã hết hạn', async () => {
    const expiringClock = new MutableClock();
    const expiring = makeJob(expiringClock, { id: 9 });
    jobs.seed(makeJob(clock, { id: 1 }), expiring);
    expiringClock.advanceDays(8);

    const result = await service.search({});

    expect(result.items.map((item) => item.id)).toEqual([1]);
  });

  it('lọc theo địa điểm, lĩnh vực và cấp bậc', async () => {
    jobs.seed(
      makeJob(clock, {
        id: 1,
        location: 'Hà Nội',
        category: 'Lập trình Backend',
        level: JobLevel.Senior,
      }),
      makeJob(clock, {
        id: 2,
        location: 'Đà Nẵng',
        category: 'Lập trình Backend',
        level: JobLevel.Senior,
      }),
      makeJob(clock, {
        id: 3,
        location: 'Hà Nội',
        category: 'Thiết kế',
        level: JobLevel.Senior,
      }),
    );

    const result = await service.search({
      location: 'hà nội',
      category: 'backend',
      level: JobLevel.Senior,
    });

    expect(result.items.map((job) => job.id)).toEqual([1]);
  });

  it.each([
    [0, 20],
    [1, 0],
    [1, 101],
  ])(
    'phân trang không hợp lệ (page=%i, pageSize=%i) bị từ chối',
    async (page, pageSize) => {
      await expect(service.search({ page, pageSize })).rejects.toThrow();
    },
  );
});

describe('JobDetailService', () => {
  const clock = new MutableClock();

  it('trả đủ nội dung chi tiết và tên công ty', async () => {
    const jobs = new FakeJobRepository().seed(
      makeJob(clock, { id: 5, title: 'Dev', skills: ['b', 'A'] }),
    );

    const detail = await new JobDetailService(jobs).getById(5);

    expect(detail).toMatchObject({
      id: 5,
      title: 'Dev',
      company: 'Công ty 30',
      skills: ['A', 'b'],
    });
  });

  it('báo không tìm thấy khi tin không tồn tại', async () => {
    await expect(
      new JobDetailService(new FakeJobRepository()).getById(1),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
  });
});

describe('JobManagementService', () => {
  const clock = new MutableClock();
  const employerOf = (companyId: number) =>
    new Employer(
      1,
      'Bình',
      'b@x.vn',
      new Company(companyId, `Công ty ${companyId}`),
    );

  function setup() {
    const jobs = new FakeJobRepository();
    const applications = new InMemoryJobApplicationRepository();
    return {
      jobs,
      applications,
      service: new JobManagementService(jobs, applications, clock),
    };
  }

  it('tạo bản nháp có kỹ năng, chưa hiển thị trong danh sách đang tuyển', async () => {
    const { jobs, service } = setup();

    const created = await service.createDraft({
      companyId: 30,
      companyName: 'ABC',
      title: 'Dev',
      location: 'HN',
      salaryMin: 1,
      salaryMax: 2,
      deadline: new Date(clock.utcNow.getTime() + 86_400_000),
      level: JobLevel.Junior,
      workMode: 'Remote' as never,
      category: 'IT',
      summary: 's',
      skills: ['TS', 'ts', 'Go'],
    });

    expect(created).toMatchObject({ status: JobStatus.Draft, applications: 0 });
    expect((await jobs.getById(created.id))!.skills.map((s) => s.name)).toEqual(
      ['TS', 'Go'],
    );
  });

  it('chỉ employer đúng công ty được đăng/đóng tin', async () => {
    const { jobs, service } = setup();
    jobs.seed(makeJob(clock, { id: 1, companyId: 30, publish: false }));

    await expect(service.publish(1, employerOf(99))).rejects.toBeInstanceOf(
      JobManagementForbiddenException,
    );
    await expect(service.publish(1, employerOf(30))).resolves.toMatchObject({
      status: JobStatus.Published,
    });
    await expect(service.close(1, employerOf(30))).resolves.toMatchObject({
      status: JobStatus.Closed,
    });
    await expect(service.publish(404, employerOf(30))).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
  });
});

describe('JobManagementService - xem và sửa tin', () => {
  const clock = new MutableClock();
  const employerOf = (companyId: number) =>
    new Employer(
      1,
      'Bình',
      'b@x.vn',
      new Company(companyId, `Công ty ${companyId}`),
    );
  const command = {
    title: 'Tiêu đề mới',
    location: 'Đà Nẵng',
    salaryMin: 3000,
    salaryMax: 4000,
    deadline: new Date(clock.utcNow.getTime() + 30 * 86_400_000),
    level: JobLevel.Lead,
    workMode: 'Hybrid' as never,
    category: 'DevOps',
    summary: 'Tóm tắt',
    description: ['Mô tả 1'],
    requirements: ['Yêu cầu 1'],
    benefits: ['Quyền lợi 1'],
    skills: ['AWS', 'aws', 'K8s'],
  };

  function setup() {
    const jobs = new FakeJobRepository().seed(
      makeJob(clock, { id: 1, companyId: 30, publish: false, skills: ['Cũ'] }),
    );
    return {
      jobs,
      service: new JobManagementService(
        jobs,
        new InMemoryJobApplicationRepository(),
        clock,
      ),
    };
  }

  it('thay toàn bộ nội dung, lưu lại và trả chi tiết đầy đủ', async () => {
    const { jobs, service } = setup();

    const detail = await service.update(1, employerOf(30), command);

    expect(detail).toMatchObject({
      title: 'Tiêu đề mới',
      location: 'Đà Nẵng',
      salaryMin: 3000,
      level: JobLevel.Lead,
      description: ['Mô tả 1'],
      benefits: ['Quyền lợi 1'],
      skills: ['AWS', 'K8s'],
      status: JobStatus.Draft,
    });
    expect((await jobs.getById(1))!.title).toBe('Tiêu đề mới');
  });

  it('chỉ công ty sở hữu được xem/sửa; tin không tồn tại báo 404', async () => {
    const { service } = setup();

    await expect(
      service.update(1, employerOf(99), command),
    ).rejects.toBeInstanceOf(JobManagementForbiddenException);
    await expect(service.getDetail(1, employerOf(99))).rejects.toBeInstanceOf(
      JobManagementForbiddenException,
    );
    await expect(service.getDetail(404, employerOf(30))).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
    await expect(service.getDetail(1, employerOf(30))).resolves.toMatchObject({
      skills: ['Cũ'],
    });
  });

  it('tin đã đóng không sửa được', async () => {
    const { service } = setup();
    await service.publish(1, employerOf(30));
    await service.close(1, employerOf(30));

    await expect(service.update(1, employerOf(30), command)).rejects.toThrow(
      'đã đóng',
    );
  });
});

describe('Skill trên tin', () => {
  it('không phân biệt hoa thường', () => {
    const job = makeJob(new MutableClock(), { skills: ['C#'] });
    expect(job.addSkill(new Skill('c#'))).toBe(false);
  });
});
