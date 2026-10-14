import { Page } from '../../application/abstractions/admin';
import {
  NewNotification,
  Notification,
  NotificationRepository,
  NotificationType,
} from '../../application/abstractions/notifications';
import { Database } from './database';

interface NotificationRow {
  id: string;
  user_id: number;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  created_at: Date;
  read_at: Date | null;
}

export class PostgresNotificationRepository extends NotificationRepository {
  constructor(private readonly db: Database) {
    super();
  }

  async addMany(notifications: NewNotification[]): Promise<void> {
    if (notifications.length === 0) return;

    // Một câu lệnh cho cả lô thay vì N lần INSERT.
    await this.db.query(
      `INSERT INTO notifications (user_id, type, title, body, link, created_at)
       SELECT * FROM unnest($1::int[], $2::text[], $3::text[], $4::text[], $5::text[], $6::timestamptz[])`,
      [
        notifications.map((n) => n.userId),
        notifications.map((n) => n.type),
        notifications.map((n) => n.title),
        notifications.map((n) => n.body),
        notifications.map((n) => n.link),
        notifications.map((n) => n.createdAt),
      ],
    );
  }

  async list(
    userId: number,
    options: { unreadOnly: boolean; page: number; pageSize: number },
  ): Promise<Page<Notification>> {
    const where = `user_id = $1${options.unreadOnly ? ' AND read_at IS NULL' : ''}`;
    const [{ rows }, { rows: totals }] = await Promise.all([
      this.db.query<NotificationRow>(
        `SELECT id, user_id, type, title, body, link, created_at, read_at
           FROM notifications WHERE ${where}
          ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`,
        [userId, options.pageSize, (options.page - 1) * options.pageSize],
      ),
      this.db.query<{ total: string }>(
        `SELECT count(*) AS total FROM notifications WHERE ${where}`,
        [userId],
      ),
    ]);

    return {
      items: rows.map((row) => ({
        id: Number(row.id),
        userId: row.user_id,
        type: row.type,
        title: row.title,
        body: row.body,
        link: row.link,
        createdAt: row.created_at,
        readAt: row.read_at,
      })),
      total: Number(totals[0].total),
    };
  }

  async countUnread(userId: number): Promise<number> {
    const { rows } = await this.db.query<{ total: string }>(
      'SELECT count(*) AS total FROM notifications WHERE user_id = $1 AND read_at IS NULL',
      [userId],
    );
    return Number(rows[0].total);
  }

  async markRead(userId: number, id: number, readAt: Date): Promise<boolean> {
    const { rowCount } = await this.db.query(
      'UPDATE notifications SET read_at = COALESCE(read_at, $3) WHERE id = $1 AND user_id = $2',
      [id, userId, readAt],
    );
    return rowCount === 1;
  }

  async markAllRead(userId: number, readAt: Date): Promise<void> {
    await this.db.query(
      'UPDATE notifications SET read_at = $2 WHERE user_id = $1 AND read_at IS NULL',
      [userId, readAt],
    );
  }
}
