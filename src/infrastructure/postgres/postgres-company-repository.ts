import { Company } from '../../domain';
import { CompanyRepository } from '../../application/abstractions/persistence';
import { CompanyNameAlreadyExistsException } from '../../application/exceptions';
import { Database, isPgError, PgErrorCode, Queryable } from './database';
import { CompanyRow, toCompany } from './row-mapper';

export const COMPANY_NAME_INDEX = 'ux_companies_name';

const nameTaken = () =>
  new CompanyNameAlreadyExistsException('Tên công ty đã được đăng ký.');

export class PostgresCompanyRepository extends CompanyRepository {
  constructor(private readonly db: Database) {
    super();
  }

  async getById(id: number): Promise<Company | null> {
    const { rows } = await this.db.query<CompanyRow>(
      'SELECT * FROM companies WHERE id = $1',
      [id],
    );
    return rows[0] ? toCompany(rows[0]) : null;
  }

  async getNextId(): Promise<number> {
    const { rows } = await this.db.query<{ id: number }>(
      "SELECT nextval('company_ids')::integer AS id",
    );
    return rows[0].id;
  }

  async add(company: Company): Promise<void> {
    try {
      await insertCompany(this.db, company);
    } catch (error) {
      if (isPgError(error, PgErrorCode.UniqueViolation)) throw nameTaken();
      throw error;
    }
  }

  async update(company: Company): Promise<void> {
    try {
      const { rowCount } = await this.db.query(
        `UPDATE companies
            SET name = $2, location = $3, website = $4, description = $5, status = $6,
                suspension_reason = $7
          WHERE id = $1`,
        [
          company.id,
          company.name,
          company.location ?? null,
          company.website ?? null,
          company.description ?? null,
          company.status,
          company.suspensionReason ?? null,
        ],
      );
      if (rowCount === 0) {
        throw new Error(`Công ty có mã ${company.id} không tồn tại.`);
      }
    } catch (error) {
      if (isPgError(error, PgErrorCode.UniqueViolation)) throw nameTaken();
      throw error;
    }
  }
}

export async function insertCompany(
  db: Queryable,
  company: Company,
): Promise<void> {
  await db.query(
    `INSERT INTO companies (id, name, location, website, description, status, suspension_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      company.id,
      company.name,
      company.location ?? null,
      company.website ?? null,
      company.description ?? null,
      company.status,
      company.suspensionReason ?? null,
    ],
  );
}
