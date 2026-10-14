import { Page } from '../../application/abstractions/admin';
import {
  NewNotification,
  Notification,
  NotificationRepository,
} from '../../application/abstractions/notifications';

export class InMemoryNotificationRepository extends NotificationRepository {
  private readonly items: Notification[] = [];
  private lastId = 0;

  addMany(notifications: NewNotification[]): Promise<void> {
    for (const notification of notifications) {
      this.items.push({ ...notification, id: ++this.lastId, readAt: null });
    }
    return Promise.resolve();
  }

  list(
    userId: number,
    options: { unreadOnly: boolean; page: number; pageSize: number },
  ): Promise<Page<Notification>> {
    const matching = this.items
      .filter(
        (item) =>
          item.userId === userId &&
          (!options.unreadOnly || item.readAt === null),
      )
      .sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id,
      );
    const start = (options.page - 1) * options.pageSize;

    return Promise.resolve({
      items: matching
        .slice(start, start + options.pageSize)
        .map((n) => ({ ...n })),
      total: matching.length,
    });
  }

  countUnread(userId: number): Promise<number> {
    return Promise.resolve(
      this.items.filter(
        (item) => item.userId === userId && item.readAt === null,
      ).length,
    );
  }

  markRead(userId: number, id: number, readAt: Date): Promise<boolean> {
    const item = this.items.find((n) => n.id === id && n.userId === userId);
    if (!item) return Promise.resolve(false);

    item.readAt ??= readAt;
    return Promise.resolve(true);
  }

  markAllRead(userId: number, readAt: Date): Promise<void> {
    for (const item of this.items) {
      if (item.userId === userId) item.readAt ??= readAt;
    }
    return Promise.resolve();
  }
}
