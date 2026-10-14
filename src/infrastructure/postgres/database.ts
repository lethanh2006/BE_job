import { OnApplicationShutdown } from '@nestjs/common';
import { Pool, QueryResultRow } from 'pg';

export interface QueryOutcome<T> {
  rows: T[];
  rowCount: number;
}

/** Thực thi truy vấn tham số hóa; được cả Database lẫn giao dịch (transaction) triển khai. */
export interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: readonly unknown[],
  ): Promise<QueryOutcome<T>>;
}

/** Bọc connection pool của `pg` và cung cấp giao dịch. */
export class Database implements Queryable, OnApplicationShutdown {
  private constructor(private readonly pool: Pool) {}

  static connect(connectionString: string, maxConnections = 10): Database {
    return new Database(new Pool({ connectionString, max: maxConnections }));
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: readonly unknown[] = [],
  ): Promise<QueryOutcome<T>> {
    const result = await this.pool.query<T>(text, [...params]);
    return { rows: result.rows, rowCount: result.rowCount ?? 0 };
  }

  /** Chạy `work` trong một giao dịch; tự rollback nếu `work` ném lỗi. */
  async transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tx: Queryable = {
        query: async <R extends QueryResultRow = QueryResultRow>(
          text: string,
          params: readonly unknown[] = [],
        ) => {
          const result = await client.query<R>(text, [...params]);
          return { rows: result.rows, rowCount: result.rowCount ?? 0 };
        },
      };
      const result = await work(tx);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.close();
  }
}

/** Mã lỗi PostgreSQL thường gặp. */
export const PgErrorCode = {
  UniqueViolation: '23505',
  ForeignKeyViolation: '23503',
} as const;

export function isPgError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === code
  );
}
