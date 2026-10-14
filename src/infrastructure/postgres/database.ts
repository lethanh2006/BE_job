import { Logger, OnApplicationShutdown } from '@nestjs/common';
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
  private static readonly logger = new Logger(Database.name);

  private constructor(private readonly pool: Pool) {}

  static connect(connectionString: string, maxConnections = 10): Database {
    const pool = new Pool({
      connectionString,
      max: maxConnections,
      // Cơ sở dữ liệu không phản hồi thì request phải lỗi sau một lúc, không treo vô hạn.
      connectionTimeoutMillis: 10_000,
    });
    // Máy chủ đóng kết nối nhàn rỗi (khởi động lại, failover, bảo trì) sẽ phát sự kiện 'error'. Không có
    // listener thì Node thoát cả tiến trình; ở đây pool tự bỏ kết nối hỏng và mở kết nối mới khi cần.
    pool.on('error', (error) =>
      Database.logger.error(
        `Kết nối PostgreSQL nhàn rỗi bị đóng: ${error.message}`,
      ),
    );
    return new Database(pool);
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
    // ROLLBACK không chạy được nghĩa là kết nối đã hỏng: hủy hẳn thay vì trả lại pool.
    let discard = false;
    // Kết nối đang mượn bị đóng giữa hai câu lệnh sẽ phát 'error' trên chính client; không có listener thì
    // Node thoát tiến trình. Ở đây chỉ ghi nhận, câu lệnh kế tiếp sẽ lỗi và giao dịch bị hủy bình thường.
    const onClientError = (error: Error) => {
      discard = true;
      Database.logger.error(
        `Kết nối PostgreSQL đang dùng trong giao dịch bị đóng: ${error.message}`,
      );
    };
    client.on('error', onClientError);
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
      await client.query('ROLLBACK').catch(() => {
        discard = true;
      });
      throw error;
    } finally {
      client.removeListener('error', onClientError);
      client.release(discard);
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
