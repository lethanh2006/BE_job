import { ReadinessProbe } from '../../application/abstractions/health';
import { Database } from '../postgres/database';

export class PostgresReadinessProbe extends ReadinessProbe {
  constructor(
    private readonly db: Database,
    private readonly timeoutMs = 2_000,
  ) {
    super();
  }

  /** Cơ sở dữ liệu treo cũng phải trả lời nhanh là "chưa sẵn sàng" thay vì làm treo health check. */
  async check(): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.db.query('SELECT 1'),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Hết thời gian chờ cơ sở dữ liệu.')),
            this.timeoutMs,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}
