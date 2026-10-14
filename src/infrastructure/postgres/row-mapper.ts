import {
  ApplicationStatus,
  Candidate,
  Clock,
  Company,
  CompanyStatus,
  Job,
  JobApplication,
  JobLevel,
  JobStatus,
  SalaryRange,
  Skill,
  WorkMode,
} from '../../domain';
import {
  AccountRole,
  RefreshTokenSession,
  UserAccount,
} from '../../application/auth';

// pg trả numeric dưới dạng chuỗi, timestamptz dưới dạng Date, text[] dưới dạng mảng.
export interface JobRow {
  id: number;
  title: string;
  company_id: number;
  company_name: string;
  company_location: string | null;
  salary_min: string;
  salary_max: string;
  deadline: Date;
  location: string;
  level: JobLevel;
  work_mode: WorkMode;
  category: string;
  summary: string;
  description: string[];
  requirements: string[];
  benefits: string[];
  posted_at: Date;
  featured: boolean;
  status: JobStatus;
  removal_reason: string | null;
  skills: string[];
  /** Trạng thái công ty (JOIN), để biết tin có đang bị ẩn vì công ty bị khóa. */
  company_status: CompanyStatus | null;
}

export interface CandidateRow {
  id: number;
  name: string;
  email: string;
  bio: string | null;
  desired_salary_min: string | null;
  desired_salary_max: string | null;
  skills: string[];
}

export interface ApplicationRow {
  id: number;
  job_id: number;
  candidate_id: number;
  status: ApplicationStatus;
  applied_at: Date;
  cv_file_id: string | null;
}

export interface UserAccountRow {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: AccountRole;
  company_id: number | null;
  company_name: string | null;
  disabled_at: Date | null;
}

export interface CompanyRow {
  id: number;
  name: string;
  location: string | null;
  website: string | null;
  description: string | null;
  status: CompanyStatus;
  suspension_reason: string | null;
}

export interface RefreshTokenRow {
  id: string;
  user_id: number;
  family_id: string;
  token_hash: string;
  created_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  replaced_by_token_hash: string | null;
}

export function toCompany(row: CompanyRow): Company {
  return new Company(row.id, row.name, row.location, {
    website: row.website,
    description: row.description,
    status: row.status,
    suspensionReason: row.suspension_reason,
  });
}

export function toJob(row: JobRow, clock: Clock): Job {
  const job = Job.restore({
    id: row.id,
    title: row.title,
    companyId: row.company_id,
    salary: new SalaryRange(Number(row.salary_min), Number(row.salary_max)),
    deadline: row.deadline,
    clock,
    company: new Company(
      row.company_id,
      row.company_name,
      row.company_location,
      { status: row.company_status ?? CompanyStatus.Active },
    ),
    location: row.location,
    level: row.level,
    workMode: row.work_mode,
    category: row.category,
    summary: row.summary,
    description: row.description,
    requirements: row.requirements,
    benefits: row.benefits,
    postedAt: row.posted_at,
    featured: row.featured,
    status: row.status,
    removalReason: row.removal_reason,
  });
  row.skills.forEach((skill) => job.addSkill(new Skill(skill)));

  return job;
}

/** Giá trị cột theo thứ tự INSERT/UPDATE của bảng jobs (bỏ id). */
export function jobColumns(job: Job): unknown[] {
  return [
    job.title,
    job.companyId,
    job.company?.name ?? `Công ty #${job.companyId}`,
    job.company?.location ?? null,
    job.salary.min,
    job.salary.max,
    job.deadline,
    job.location,
    job.level,
    job.workMode,
    job.category,
    job.summary,
    [...job.description],
    [...job.requirements],
    [...job.benefits],
    job.postedAt,
    job.featured,
    job.status,
    job.removalReason ?? null,
    job.skills.map((skill) => skill.name),
  ];
}

export function toCandidate(row: CandidateRow): Candidate {
  const desiredSalary =
    row.desired_salary_min !== null && row.desired_salary_max !== null
      ? new SalaryRange(
          Number(row.desired_salary_min),
          Number(row.desired_salary_max),
        )
      : null;
  const candidate = new Candidate(
    row.id,
    row.name,
    row.email,
    row.bio,
    desiredSalary,
  );
  row.skills.forEach((skill) => candidate.addSkill(new Skill(skill)));

  return candidate;
}

export function toApplication(row: ApplicationRow): JobApplication {
  return new JobApplication(
    row.id,
    row.job_id,
    row.candidate_id,
    row.applied_at,
    row.status,
    row.cv_file_id,
  );
}

export function toUserAccount(row: UserAccountRow): UserAccount {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    companyId: row.company_id,
    companyName: row.company_name,
    disabled: row.disabled_at !== null,
  };
}

export function toRefreshTokenSession(
  row: RefreshTokenRow,
): RefreshTokenSession {
  return RefreshTokenSession.restore(
    row.id,
    row.user_id,
    row.family_id,
    row.token_hash,
    row.created_at,
    row.expires_at,
    row.revoked_at,
    row.replaced_by_token_hash,
  );
}
