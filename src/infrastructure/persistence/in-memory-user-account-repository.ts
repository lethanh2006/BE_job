import { Candidate } from '../../domain';
import {
  AccountRegistrationRepository,
  AccountSecurityRepository,
  PasswordHasher,
  UserAccountRepository,
} from '../../application/abstractions/authentication';
import { CandidateRepository } from '../../application/abstractions/persistence';
import { UserAccount } from '../../application/auth';
import { createDemoAccounts } from '../seed/demo-data';

/** Một lớp triển khai cả 3 abstraction về tài khoản (đọc, đăng ký, bảo mật). */
export class InMemoryUserAccountRepository
  implements
    UserAccountRepository,
    AccountRegistrationRepository,
    AccountSecurityRepository
{
  private readonly accounts = new Map<string, UserAccount>();
  private lastId = 0;

  private constructor(private readonly candidates: CandidateRepository) {}

  /** Tạo repository kèm 3 tài khoản demo (candidate / employer / admin). */
  static async createWithDemoData(
    passwordHasher: PasswordHasher,
    candidates: CandidateRepository,
  ): Promise<InMemoryUserAccountRepository> {
    const repository = new InMemoryUserAccountRepository(candidates);
    const demoAccounts = await createDemoAccounts(passwordHasher);

    demoAccounts.forEach((account) =>
      repository.accounts.set(account.email.toLowerCase(), account),
    );
    repository.lastId = Math.max(...demoAccounts.map((a) => a.id));

    return repository;
  }

  findByEmail(normalizedEmail: string): Promise<UserAccount | null> {
    return Promise.resolve(
      this.accounts.get(normalizedEmail.toLowerCase()) ?? null,
    );
  }

  findById(id: number): Promise<UserAccount | null> {
    return Promise.resolve(
      [...this.accounts.values()].find((account) => account.id === id) ?? null,
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
}
