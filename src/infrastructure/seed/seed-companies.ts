import { readFile } from 'node:fs/promises';
import { Company } from '../../domain';

interface SeedJobCompany {
  companyId: number;
  company: string;
  location: string;
}

/** Danh sách công ty mẫu, suy ra từ file tin tuyển dụng mẫu (mỗi companyId một công ty). */
export async function loadSeedCompanies(
  jobSeedFile: string,
): Promise<Company[]> {
  const seeds = JSON.parse(
    await readFile(jobSeedFile, 'utf8'),
  ) as SeedJobCompany[];
  const byId = new Map<number, Company>();
  for (const seed of seeds) {
    if (!byId.has(seed.companyId)) {
      byId.set(
        seed.companyId,
        new Company(seed.companyId, seed.company, seed.location),
      );
    }
  }

  return [...byId.values()].sort((a, b) => a.id - b.id);
}

/** Mã công ty cấp tự động bắt đầu sau dữ liệu mẫu (khớp sequence `company_ids` ở PostgreSQL). */
export const FIRST_GENERATED_COMPANY_ID = 100;
