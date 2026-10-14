import {
  AuditEntry,
  AuditLogRepository,
  Page,
} from '../../application/abstractions/admin';

export class InMemoryAuditLogRepository extends AuditLogRepository {
  private readonly entries: AuditEntry[] = [];

  add(entry: Omit<AuditEntry, 'id'>): Promise<void> {
    this.entries.push({ ...entry, id: this.entries.length + 1 });
    return Promise.resolve();
  }

  list(page: number, pageSize: number): Promise<Page<AuditEntry>> {
    const newestFirst = [...this.entries].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id,
    );
    const start = (page - 1) * pageSize;

    return Promise.resolve({
      items: newestFirst.slice(start, start + pageSize),
      total: newestFirst.length,
    });
  }
}
