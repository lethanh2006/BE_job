import { Company } from '../../domain';
import { CompanyRepository } from '../../application/abstractions/persistence';
import { CompanyNameAlreadyExistsException } from '../../application/exceptions';
import {
  FIRST_GENERATED_COMPANY_ID,
  loadSeedCompanies,
} from '../seed/seed-companies';

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export class InMemoryCompanyRepository extends CompanyRepository {
  private companies: Map<number, Company> | null = null;
  private loading: Promise<Map<number, Company>> | null = null;
  private lastId = FIRST_GENERATED_COMPANY_ID - 1;

  /** `jobSeedFile` null: bắt đầu rỗng (dùng trong test). */
  constructor(private readonly jobSeedFile: string | null = null) {
    super();
  }

  async getById(id: number): Promise<Company | null> {
    return (await this.load()).get(id) ?? null;
  }

  async getNextId(): Promise<number> {
    await this.load();
    return ++this.lastId;
  }

  async add(company: Company): Promise<void> {
    const companies = await this.load();
    if (companies.has(company.id)) {
      throw new Error(`Công ty có mã ${company.id} đã tồn tại.`);
    }
    this.assertNameFree(companies, company);
    companies.set(company.id, company);
    this.lastId = Math.max(this.lastId, company.id);
  }

  async update(company: Company): Promise<void> {
    const companies = await this.load();
    this.assertNameFree(companies, company);
    companies.set(company.id, company);
  }

  private assertNameFree(companies: Map<number, Company>, company: Company) {
    for (const other of companies.values()) {
      if (other.id !== company.id && sameName(other.name, company.name)) {
        throw new CompanyNameAlreadyExistsException(
          'Tên công ty đã được đăng ký.',
        );
      }
    }
  }

  private load(): Promise<Map<number, Company>> {
    if (this.companies) return Promise.resolve(this.companies);

    this.loading ??= (
      this.jobSeedFile
        ? loadSeedCompanies(this.jobSeedFile)
        : Promise.resolve([])
    ).then((seeds) => {
      this.companies = new Map(seeds.map((company) => [company.id, company]));
      return this.companies;
    });

    return this.loading;
  }
}
