import { Database } from '../postgres/database';
import { AlwaysReadyProbe } from './always-ready-probe';
import { PostgresReadinessProbe } from './postgres-readiness-probe';

const fakeDatabase = (query: () => Promise<unknown>) =>
  ({ query }) as unknown as Database;

describe('AlwaysReadyProbe', () => {
  it('luôn sẵn sàng', async () => {
    await expect(new AlwaysReadyProbe().check()).resolves.toBeUndefined();
  });
});

describe('PostgresReadinessProbe', () => {
  it('sẵn sàng khi truy vấn thành công', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [], rowCount: 1 });

    await expect(
      new PostgresReadinessProbe(fakeDatabase(query)).check(),
    ).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledWith('SELECT 1');
  });

  it('chuyển tiếp lỗi kết nối', async () => {
    const probe = new PostgresReadinessProbe(
      fakeDatabase(() => Promise.reject(new Error('ECONNREFUSED'))),
    );

    await expect(probe.check()).rejects.toThrow('ECONNREFUSED');
  });

  it('cơ sở dữ liệu treo thì báo hết thời gian chờ thay vì treo theo', async () => {
    const probe = new PostgresReadinessProbe(
      fakeDatabase(() => new Promise(() => undefined)),
      20,
    );

    await expect(probe.check()).rejects.toThrow(
      'Hết thời gian chờ cơ sở dữ liệu.',
    );
  });
});
