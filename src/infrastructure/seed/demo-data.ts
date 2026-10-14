import {
  ApplicationStatus,
  Candidate,
  JobApplication,
  SalaryRange,
  Skill,
} from '../../domain';
import { PasswordHasher } from '../../application/abstractions/authentication';
import { AccountRole, UserAccount } from '../../application/auth';

export const DEMO_PASSWORD = 'JobBoard@123';

/** Hồ sơ ứng viên mẫu (mã 20) dùng chung cho mọi provider lưu trữ. */
export function createDemoCandidate(): Candidate {
  const candidate = new Candidate(
    20,
    'Nguyễn Minh An',
    'an@example.com',
    'Backend Developer yêu thích sản phẩm có tác động thực tế và những hệ thống được thiết kế chỉn chu.',
    new SalaryRange(1800, 2800),
  );
  ['C#', 'ASP.NET Core', 'PostgreSQL', 'Docker'].forEach((skill) =>
    candidate.addSkill(new Skill(skill)),
  );

  return candidate;
}

export function createDemoApplications(): JobApplication[] {
  return [
    new JobApplication(
      1,
      2,
      20,
      new Date('2026-09-25T08:00:00Z'),
      ApplicationStatus.Reviewing,
    ),
    new JobApplication(
      2,
      5,
      20,
      new Date('2026-09-21T08:00:00Z'),
      ApplicationStatus.Submitted,
    ),
    new JobApplication(
      3,
      6,
      20,
      new Date('2026-09-12T08:00:00Z'),
      ApplicationStatus.Rejected,
    ),
  ];
}

/** Ba tài khoản demo (ứng viên, nhà tuyển dụng, quản trị) cùng mật khẩu DEMO_PASSWORD. */
export async function createDemoAccounts(
  hasher: PasswordHasher,
): Promise<UserAccount[]> {
  const passwordHash = await hasher.hash(DEMO_PASSWORD);

  return [
    {
      id: 20,
      name: 'Nguyễn Minh An',
      email: 'candidate@jobboard.vn',
      passwordHash,
      role: AccountRole.Candidate,
    },
    {
      id: 1,
      name: 'Trần Bình',
      email: 'employer@jobboard.vn',
      passwordHash,
      role: AccountRole.Employer,
      companyId: 1,
    },
    {
      id: 100,
      name: 'Quản trị viên',
      email: 'admin@jobboard.vn',
      passwordHash,
      role: AccountRole.Admin,
    },
  ];
}
