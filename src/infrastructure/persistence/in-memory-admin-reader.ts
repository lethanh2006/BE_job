import {
  AdminCompanyCriteria,
  AdminCompanyRow,
  AdminJobCriteria,
  AdminJobRow,
  AdminReader,
  AdminStats,
  AdminUserCriteria,
  AdminUserRow,
  Page,
} from '../../application/abstractions/admin';
import {
  JobApplicationRepository,
  JobRepository,
} from '../../application/abstractions/persistence';
import { AccountRole } from '../../application/auth';
import { foldText } from '../../application/common/text-folding';
import { CompanyStatus, Job, JobStatus } from '../../domain';
import { InMemoryCompanyRepository } from './in-memory-company-repository';
import { InMemoryUserAccountRepository } from './in-memory-user-account-repository';

const includesFolded = (text: string, part: string) =>
  foldText(text).includes(part);

const slice = <T>(rows: T[], page: number, pageSize: number): Page<T> => ({
  items: rows.slice((page - 1) * pageSize, page * pageSize),
  total: rows.length,
});

/** Triển khai trong bộ nhớ của các màn hình quản trị; làm chuẩn so sánh cho bản PostgreSQL. */
export class InMemoryAdminReader extends AdminReader {
  constructor(
    private readonly jobs: JobRepository,
    private readonly applications: JobApplicationRepository,
    private readonly companies: InMemoryCompanyRepository,
    private readonly accounts: InMemoryUserAccountRepository,
  ) {
    super();
  }

  async stats(): Promise<AdminStats> {
    const [jobs, companies, accounts, applications] = await Promise.all([
      this.jobs.getAll(),
      this.companies.listAll(),
      this.accounts.listAll(),
      this.applications.getAll(),
    ]);
    const jobsWith = (status: JobStatus) =>
      jobs.filter((job) => job.status === status).length;
    const usersWith = (role: AccountRole) =>
      accounts.filter((account) => account.role === role).length;

    return {
      users: {
        candidates: usersWith(AccountRole.Candidate),
        employers: usersWith(AccountRole.Employer),
        admins: usersWith(AccountRole.Admin),
      },
      companies: {
        active: companies.filter((c) => c.status === CompanyStatus.Active)
          .length,
        suspended: companies.filter((c) => c.status === CompanyStatus.Suspended)
          .length,
      },
      jobs: {
        draft: jobsWith(JobStatus.Draft),
        published: jobsWith(JobStatus.Published),
        closed: jobsWith(JobStatus.Closed),
        removed: jobsWith(JobStatus.Removed),
      },
      applications: applications.length,
    };
  }

  async searchJobs(c: AdminJobCriteria): Promise<Page<AdminJobRow>> {
    const matching = (await this.jobs.getAll())
      .filter(
        (job) =>
          (c.status === undefined || job.status === c.status) &&
          (c.companyId === undefined || job.companyId === c.companyId) &&
          (!c.keyword || matchesKeyword(job, c.keyword)),
      )
      .sort((a, b) => b.id - a.id);
    const pageOfJobs = slice(matching, c.page, c.pageSize);
    const counts = await this.applications.countByJobIds(
      pageOfJobs.items.map((job) => job.id),
    );

    return {
      total: pageOfJobs.total,
      items: pageOfJobs.items.map((job) => ({
        id: job.id,
        title: job.title,
        companyId: job.companyId,
        company: job.company?.name ?? `Công ty #${job.companyId}`,
        status: job.status,
        removalReason: job.removalReason ?? null,
        applications: counts.get(job.id) ?? 0,
        postedAt: job.postedAt,
        deadline: job.deadline,
      })),
    };
  }

  async searchCompanies(
    c: AdminCompanyCriteria,
  ): Promise<Page<AdminCompanyRow>> {
    const [companies, jobs, accounts] = await Promise.all([
      this.companies.listAll(),
      this.jobs.getAll(),
      this.accounts.listAll(),
    ]);
    const rows = companies
      .filter(
        (company) =>
          (c.status === undefined || company.status === c.status) &&
          (!c.keyword || includesFolded(company.name, c.keyword)),
      )
      .sort((a, b) => a.id - b.id)
      .map((company): AdminCompanyRow => ({
        id: company.id,
        name: company.name,
        location: company.location ?? null,
        status: company.status,
        suspensionReason: company.suspensionReason ?? null,
        jobs: jobs.filter((job) => job.companyId === company.id).length,
        members: accounts.filter((account) => account.companyId === company.id)
          .length,
      }));

    return slice(rows, c.page, c.pageSize);
  }

  async searchUsers(c: AdminUserCriteria): Promise<Page<AdminUserRow>> {
    const rows = (await this.accounts.listAll())
      .filter(
        (account) =>
          (c.role === undefined || account.role === c.role) &&
          (c.disabled === undefined ||
            (account.disabled ?? false) === c.disabled) &&
          (!c.keyword ||
            includesFolded(account.name, c.keyword) ||
            account.email.toLowerCase().includes(c.keyword)),
      )
      .sort((a, b) => a.id - b.id)
      .map((account): AdminUserRow => ({
        id: account.id,
        name: account.name,
        email: account.email,
        role: account.role,
        companyId: account.companyId ?? null,
        companyName: account.companyName ?? null,
        disabled: account.disabled ?? false,
      }));

    return slice(rows, c.page, c.pageSize);
  }
}

function matchesKeyword(job: Job, keyword: string): boolean {
  return (
    includesFolded(job.title, keyword) ||
    (job.company ? includesFolded(job.company.name, keyword) : false) ||
    job.skills.some((skill) => includesFolded(skill.name, keyword))
  );
}
