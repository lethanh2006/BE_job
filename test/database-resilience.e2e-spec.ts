import { Logger } from '@nestjs/common';
import { Client } from 'pg';
import { Database } from '../src/infrastructure/postgres/database';
import { createTestDatabase } from './support/postgres-test-database';

const describeWithPostgres = process.env.E2E_POSTGRES_URL
  ? describe
  : describe.skip;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describeWithPostgres('Cơ sở dữ liệu bị ngắt kết nối giữa chừng', () => {
  let testDatabase: Awaited<ReturnType<typeof createTestDatabase>>;
  let db: Database;

  /** Mô phỏng khởi động lại/failover: máy chủ đóng mọi kết nối đang mở tới database này. */
  async function terminateAllConnections() {
    const admin = new Client({
      connectionString: process.env.E2E_POSTGRES_URL,
    });
    await admin.connect();
    try {
      await admin.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
        [testDatabase.name],
      );
    } finally {
      await admin.end();
    }
  }

  beforeAll(async () => {
    // Lỗi kết nối bị đóng là điều test cố tình gây ra, không cần in ra log.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    testDatabase = await createTestDatabase(process.env.E2E_POSTGRES_URL!);
    db = Database.connect(testDatabase.url);
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await db.close();
    await testDatabase.drop();
  });

  it('tiến trình không bị sập khi kết nối nhàn rỗi bị đóng và truy vấn sau đó dùng kết nối mới', async () => {
    await Promise.all(Array.from({ length: 5 }, () => db.query('SELECT 1')));

    await terminateAllConnections();
    // Chờ sự kiện 'error' của pool được phát; trước đây nó làm Node thoát vì không có listener.
    await sleep(300);

    const { rows } = await db.query<{ ok: number }>('SELECT 1 AS ok');
    expect(rows[0].ok).toBe(1);
  });

  it('giao dịch gặp kết nối chết bị hủy, giao dịch kế tiếp vẫn chạy được', async () => {
    const failing = db.transaction(async (tx) => {
      await tx.query('SELECT 1');
      await terminateAllConnections();
      await sleep(300);
      await tx.query('SELECT 2');
    });
    await expect(failing).rejects.toThrow();

    const result = await db.transaction(async (tx) => {
      const { rows } = await tx.query<{ ok: number }>('SELECT 3 AS ok');
      return rows[0].ok;
    });
    expect(result).toBe(3);
  });
});
