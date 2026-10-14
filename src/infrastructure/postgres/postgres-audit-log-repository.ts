import {
  AuditAction,
  AuditEntry,
  AuditLogRepository,
  AuditTargetType,
  Page,
} from '../../application/abstractions/admin';
import { Database } from './database';

interface AuditRow {
  id: string;
  actor_id: number;
  actor_name: string;
  action: AuditAction;
  target_type: AuditTargetType;
  target_id: number;
  detail: string | null;
  created_at: Date;
}

export class PostgresAuditLogRepository extends AuditLogRepository {
  constructor(private readonly db: Database) {
    super();
  }

  async add(entry: Omit<AuditEntry, 'id'>): Promise<void> {
    await this.db.query(
      `INSERT INTO audit_logs (actor_id, actor_name, action, target_type, target_id, detail, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.actorId,
        entry.actorName,
        entry.action,
        entry.targetType,
        entry.targetId,
        entry.detail,
        entry.createdAt,
      ],
    );
  }

  async list(page: number, pageSize: number): Promise<Page<AuditEntry>> {
    const [{ rows }, { rows: totals }] = await Promise.all([
      this.db.query<AuditRow>(
        `SELECT id, actor_id, actor_name, action, target_type, target_id, detail, created_at
           FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT $1 OFFSET $2`,
        [pageSize, (page - 1) * pageSize],
      ),
      this.db.query<{ total: string }>(
        'SELECT count(*) AS total FROM audit_logs',
      ),
    ]);

    return {
      items: rows.map((row) => ({
        id: Number(row.id),
        actorId: row.actor_id,
        actorName: row.actor_name,
        action: row.action,
        targetType: row.target_type,
        targetId: row.target_id,
        detail: row.detail,
        createdAt: row.created_at,
      })),
      total: Number(totals[0].total),
    };
  }
}
