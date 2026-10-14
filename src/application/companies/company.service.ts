import { Injectable } from '@nestjs/common';
import { Company, CompanyStatus } from '../../domain';
import { CompanyRepository, JobRepository } from '../abstractions/persistence';
import { ResourceNotFoundException } from '../exceptions';

export interface CompanyProfileDto {
  id: number;
  name: string;
  location: string | null;
  website: string | null;
  description: string | null;
  status: CompanyStatus;
}

export interface UpdateCompanyCommand {
  name: string;
  location?: string | null;
  website?: string | null;
  description?: string | null;
}

@Injectable()
export class CompanyService {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly jobs: JobRepository,
  ) {}

  /** Hồ sơ công khai: công ty bị khóa coi như không tồn tại. */
  async getPublicProfile(id: number): Promise<CompanyProfileDto> {
    const company = await this.getCompany(id);
    if (company.status !== CompanyStatus.Active) throw notFound(id);

    return toDto(company);
  }

  /** Hồ sơ dành cho chính chủ, xem được cả khi công ty đang bị khóa. */
  async getOwnProfile(id: number): Promise<CompanyProfileDto> {
    return toDto(await this.getCompany(id));
  }

  async updateProfile(
    id: number,
    command: UpdateCompanyCommand,
  ): Promise<CompanyProfileDto> {
    const company = await this.getCompany(id);

    company.updateProfile(command);
    await this.companies.update(company);
    // Tên/địa điểm công ty được lưu kèm từng tin để tìm kiếm; đồng bộ lại (an toàn khi thử lại).
    await this.jobs.updateCompanySnapshot(company);

    return toDto(company);
  }

  private async getCompany(id: number): Promise<Company> {
    const company = await this.companies.getById(id);
    if (!company) throw notFound(id);

    return company;
  }
}

const notFound = (id: number) =>
  new ResourceNotFoundException(`Không tìm thấy công ty có mã ${id}.`);

const toDto = (company: Company): CompanyProfileDto => ({
  id: company.id,
  name: company.name,
  location: company.location ?? null,
  website: company.website ?? null,
  description: company.description ?? null,
  status: company.status,
});
