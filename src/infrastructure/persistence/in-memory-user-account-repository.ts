import { Candidate, Company } from '../../domain';
import {
  AccountRegistrationRepository,
  AccountSecurityRepository,
  EmployerRegistrationOutcome,
  EmployerRegistrationRepository,
  PasswordHasher,
  UserAccountRepository,
} from '../../application/abstractions/authentication';
import {
  CandidateRepository,
  CompanyRepository,
} from '../../application/abstractions/persistence';
import { CompanyNameAlreadyExistsException } from '../../application/exceptions';
import { UserAccount } from '../../application/auth';
import { createDemoAccounts } from '../seed/demo-data';

/** Một lớp triển khai các abstraction về tài khoản (đọc, đăng ký ứng viên/nhà tuyển dụng, bảo mật). */
export class InMemoryUserAccountRepository
  implements
    UserAccountRepository,
    AccountRegistrationRepository,
    EmployerRegistrationRepository,
    AccountSecurityRepository
{
  private readonly accounts = new Map<string, UserAccount>();
  private lastId = 0;

  private constructor(
    private readonly candidates: CandidateRepository,
    private readonly companies: CompanyRepository,
  ) {}

  /** Tạo repository kèm 3 tài khoản demo (candidate / employer / admin). */
  static async createWithDemoData(
    passwordHasher: PasswordHasher,
    candidates: CandidateRepository,
    companies: CompanyRepository,
  ): Promise<InMemoryUserAccountRepository> {
    const repository = new InMemoryUserAccountRepository(candidates, companies);
    const demoAccounts = await createDemoAccounts(passwordHasher);

    demoAccounts.forEach((account) =>
      repository.accounts.set(account.email.toLowerCase(), account),
    );
    repository.lastId = Math.max(...demoAccounts.map((a) => a.id));

    return repository;
  }

  async findByEmail(normalizedEmail: string): Promise<UserAccount | null> {
    return this.withCompanyName(
      this.accounts.get(normalizedEmail.toLowerCase()),
    );
  }

  async findById(id: number): Promise<UserAccount | null> {
    return this.withCompanyName(
      [...this.accounts.values()].find((account) => account.id === id),
    );
  }

  getNextUserId(): Promise<number> {
    return Promise.resolve(++this.lastId);
  }

  emailExists(normalizedEmail: string): Promise<boolean> {
    return Promise.resolve(this.accounts.has(normalizedEmail.toLowerCase()));
  }

  async registerCandidate(
    account: UserAccount,
    candidate: Candidate,
  ): Promise<boolean> {
    const key = account.email.toLowerCase();
    if (this.accounts.has(key)) return false;

    this.accounts.set(key, account);
    try {
      await this.candidates.add(candidate);
      return true;
    } catch (error) {
      this.accounts.delete(key);
      throw error;
    }
  }

  async registerEmployer(
    account: UserAccount,
    company: Company,
  ): Promise<EmployerRegistrationOutcome> {
    const key = account.email.toLowerCase();
    if (this.accounts.has(key)) return 'EmailTaken';

    // Giữ chỗ email ngay (không có await giữa kiểm tra và ghi) rồi mới tạo công ty.
    this.accounts.set(key, { ...account, companyId: company.id });
    try {
      await this.companies.add(company);
      return 'Created';
    } catch (error) {
      this.accounts.delete(key);
      if (error instanceof CompanyNameAlreadyExistsException) {
        return 'CompanyNameTaken';
      }
      throw error;
    }
  }

  setDisabled(userId: number, disabled: boolean): Promise<boolean> {
    const current = [...this.accounts.values()].find((a) => a.id === userId);
    if (!current) return Promise.resolve(false);

    this.accounts.set(current.email.toLowerCase(), { ...current, disabled });
    return Promise.resolve(true);
  }

  /** Toàn bộ tài khoản (kèm tên công ty), phục vụ trang quản trị của provider in-memory. */
  async listAll(): Promise<UserAccount[]> {
    return Promise.all(
      [...this.accounts.values()].map(
        async (account) => (await this.withCompanyName(account))!,
      ),
    );
  }

  tryUpdatePasswordHash(
    userId: number,
    expectedPasswordHash: string,
    newPasswordHash: string,
  ): Promise<boolean> {
    const current = [...this.accounts.values()].find((a) => a.id === userId);
    if (!current || current.passwordHash !== expectedPasswordHash) {
      return Promise.resolve(false);
    }

    this.accounts.set(current.email.toLowerCase(), {
      ...current,
      passwordHash: newPasswordHash,
    });
    return Promise.resolve(true);
  }

  /** Tên công ty luôn lấy từ repository công ty để đổi tên có hiệu lực ngay. */
  private async withCompanyName(
    account: UserAccount | undefined,
  ): Promise<UserAccount | null> {
    if (!account) return null;
    if (account.companyId == null) return account;

    const company = await this.companies.getById(account.companyId);
    return { ...account, companyName: company?.name ?? null };
  }
}
