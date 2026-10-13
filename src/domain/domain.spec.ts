import {
  ArgumentError,
  ApplicationStatus,
  Candidate,
  Clock,
  Company,
  Employer,
  InvalidJobStateException,
  Job,
  JobApplication,
  JobManagementForbiddenException,
  JobStatus,
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
