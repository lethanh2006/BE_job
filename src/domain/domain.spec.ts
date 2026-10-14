import {
  ArgumentError,
  ApplicationStatus,
  Candidate,
  Clock,
  Company,
  CompanyStatus,
  Employer,
  InvalidJobStateException,
  Job,
  JobApplication,
  JobLevel,
  JobManagementForbiddenException,
  JobStatus,
  WorkMode,
  SalaryRange,
  Skill,
} from './index';

class FixedClock extends Clock {
  constructor(private now: Date) {
    super();
  }
  get utcNow(): Date {
    return this.now;
  }
}

const clock = new FixedClock(new Date('2026-10-01T00:00:00Z'));
const makeJob = (companyId = 1, deadline = new Date('2026-12-01T00:00:00Z')) =>
  Job.create({
    id: 1,
    title: '  Backend  ',
    companyId,
    salary: new SalaryRange(1000, 2000),
    deadline,
    clock,
  });

describe('SalaryRange', () => {
  it('từ chối khoảng lương sai', () => {
    expect(() => new SalaryRange(-1, 10)).toThrow(ArgumentError);
    expect(() => new SalaryRange(10, 5)).toThrow(ArgumentError);
  });

  it('kiểm tra giao nhau', () => {
    const range = new SalaryRange(100, 200);
    expect(range.overlaps(new SalaryRange(200, 300))).toBe(true);
    expect(range.overlaps(new SalaryRange(201, 300))).toBe(false);
  });
});

describe('Job', () => {
  it('chuẩn hóa tiêu đề và bắt đầu ở trạng thái Draft', () => {
    const job = makeJob();
    expect(job.title).toBe('Backend');
    expect(job.status).toBe(JobStatus.Draft);
  });

  it('từ chối hạn nộp trong quá khứ nhưng restore thì cho phép', () => {
    const past = new Date('2026-01-01T00:00:00Z');
    expect(() => makeJob(1, past)).toThrow(ArgumentError);

    const restored = Job.restore({
      id: 1,
      title: 'Cũ',
      companyId: 1,
      salary: new SalaryRange(1, 2),
      deadline: past,
      clock,
      postedAt: past,
      status: JobStatus.Published,
    });
    expect(restored.isExpired).toBe(true);
  });

  it('đi qua Draft → Published → Closed và phát sự kiện đăng', () => {
    const job = makeJob();
    const listener = jest.fn();
    job.onPublished(listener);

    expect(() => job.close()).toThrow(InvalidJobStateException);
    job.publish();
    expect(listener).toHaveBeenCalledWith(job);
    expect(() => job.publish()).toThrow(InvalidJobStateException);
    job.close();
    expect(job.status).toBe(JobStatus.Closed);
  });

  it('kỹ năng không phân biệt hoa thường và giới hạn 15', () => {
    const job = makeJob();
    expect(job.addSkill(new Skill('C#'))).toBe(true);
    expect(job.addSkill(new Skill('c#'))).toBe(false);
    for (let i = 0; i < 14; i++) job.addSkill(new Skill(`skill-${i}`));
    expect(() => job.addSkill(new Skill('extra'))).toThrow(ArgumentError);
  });
});

describe('Job.update', () => {
  const content = (overrides: Partial<Parameters<Job['update']>[0]> = {}) => ({
    title: '  Tiêu đề mới ',
    salary: new SalaryRange(2000, 3000),
    deadline: new Date('2026-12-01T00:00:00Z'),
    location: ' Hà Nội ',
    level: JobLevel.Senior,
    workMode: WorkMode.Remote,
    category: 'IT',
    summary: ' tóm tắt ',
    description: ['a', '  ', ' b '],
    requirements: ['r'],
    benefits: [],
    ...overrides,
  });

  it('thay toàn bộ nội dung và kỹ năng, chuẩn hóa chuỗi', () => {
    const job = makeJob();
    job.addSkill(new Skill('Cũ'));

    job.update(content(), [
      new Skill('Go'),
      new Skill('go'),
      new Skill('Rust'),
    ]);

    expect(job).toMatchObject({
      title: 'Tiêu đề mới',
      location: 'Hà Nội',
      level: JobLevel.Senior,
      workMode: WorkMode.Remote,
      summary: 'tóm tắt',
    });
    expect(job.salary.min).toBe(2000);
    expect(job.description).toEqual(['a', 'b']);
    expect(job.skills.map((s) => s.name)).toEqual(['Go', 'Rust']);
  });

  it('không sửa được tin đã đóng', () => {
    const job = makeJob();
    job.publish();
    job.close();

    expect(() => job.update(content(), [])).toThrow(InvalidJobStateException);
  });

  it('chỉ kiểm tra hạn tương lai khi hạn nộp thay đổi', () => {
    const job = makeJob();

    expect(() =>
      job.update(content({ deadline: new Date('2026-09-01T00:00:00Z') }), []),
    ).toThrow(ArgumentError);
    // Giữ nguyên hạn nộp (kể cả đã quá hạn) thì vẫn sửa được nội dung khác.
    expect(() =>
      job.update(content({ deadline: job.deadline }), []),
    ).not.toThrow();
  });

  it('từ chối tiêu đề rỗng và quá 15 kỹ năng, không làm hỏng dữ liệu cũ', () => {
    const job = makeJob();
    const tooMany = Array.from({ length: 16 }, (_, i) => new Skill(`s${i}`));

    expect(() => job.update(content({ title: '  ' }), [])).toThrow(
      ArgumentError,
    );
    expect(() => job.update(content(), tooMany)).toThrow(ArgumentError);
    expect(job.title).toBe('Backend');
  });
});

describe('Company', () => {
  it('chuẩn hóa và kiểm tra hồ sơ', () => {
    const company = new Company(1, '  Nova  ', ' Hà Nội ', {
      website: ' https://nova.vn ',
      description: '  Giới thiệu ',
    });

    expect(company).toMatchObject({
      name: 'Nova',
      location: 'Hà Nội',
      website: 'https://nova.vn',
      description: 'Giới thiệu',
      status: CompanyStatus.Active,
    });
  });

  it('bỏ trống trường tùy chọn thành undefined', () => {
    const company = new Company(1, 'Nova', '  ', {
      website: '',
      description: null,
    });

    expect(company.location).toBeUndefined();
    expect(company.website).toBeUndefined();
    expect(company.description).toBeUndefined();
  });

  it.each([
    ['tên rỗng', () => new Company(1, '  ')],
    ['tên quá dài', () => new Company(1, 'x'.repeat(201))],
    [
      'website không phải http(s)',
      () => new Company(1, 'Nova', null, { website: 'ftp://nova.vn' }),
    ],
    [
      'website không phải URL',
      () => new Company(1, 'Nova', null, { website: 'nova.vn' }),
    ],
    [
      'giới thiệu quá dài',
      () => new Company(1, 'Nova', null, { description: 'x'.repeat(4001) }),
    ],
  ])('từ chối %s', (_name, create) => {
    expect(create).toThrow(ArgumentError);
  });

  it('updateProfile thay toàn bộ và giữ nguyên hồ sơ cũ nếu dữ liệu sai', () => {
    const company = new Company(1, 'Nova', 'HN', {
      website: 'https://nova.vn',
    });

    company.updateProfile({ name: 'Nova Group' });
    expect(company).toMatchObject({ name: 'Nova Group' });
    expect(company.location).toBeUndefined();
    expect(company.website).toBeUndefined();

    expect(() => company.updateProfile({ name: '' })).toThrow(ArgumentError);
    expect(company.name).toBe('Nova Group');
  });
});

describe('Job.refreshCompany', () => {
  it('cập nhật bản chụp công ty nhưng không cho đổi sang công ty khác', () => {
    const job = makeJob(1);
    job.refreshCompany(new Company(1, 'Tên mới'));

    expect(job.company?.name).toBe('Tên mới');
    expect(() => job.refreshCompany(new Company(2, 'Khác'))).toThrow(
      ArgumentError,
    );
  });
});

describe('Quyền quản lý tin', () => {
  it('employer chỉ quản lý được tin của công ty mình', () => {
    const job = makeJob(1);
    const own = new Employer(1, 'A', 'a@x.vn', new Company(1, 'Nova'));
    const other = new Employer(2, 'B', 'b@x.vn', new Company(2, 'Lumi'));
    expect(own.canManage(job)).toBe(true);
    expect(other.canManage(job)).toBe(false);
  });

  it('đổi trạng thái đơn bị chặn nếu không có quyền', () => {
    const job = makeJob(1);
    const application = new JobApplication(1, 1, 20, clock.utcNow);
    const other = new Employer(2, 'B', 'b@x.vn', new Company(2, 'Lumi'));
    expect(() =>
      application.changeStatus(ApplicationStatus.Accepted, other, job),
    ).toThrow(JobManagementForbiddenException);
  });
});

describe('Candidate', () => {
  it('updateProfile thay toàn bộ kỹ năng và chuẩn hóa bio', () => {
    const candidate = new Candidate(20, 'An', 'an@x.vn');
    candidate.addSkill(new Skill('Old'));
    candidate.updateProfile('new@x.vn', '  bio ', new SalaryRange(1, 2), [
      new Skill('TS'),
      new Skill('ts'),
    ]);
    expect(candidate.email).toBe('new@x.vn');
    expect(candidate.bio).toBe('bio');
    expect(candidate.skills.map((s) => s.name)).toEqual(['TS']);
  });

  it('email không có @ bị từ chối', () => {
    expect(() => new Candidate(1, 'An', 'khong-hop-le')).toThrow(ArgumentError);
  });
});
