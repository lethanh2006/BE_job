import {
  SavedJob,
  SavedJobRepository,
} from '../../application/abstractions/saved-jobs';

export class InMemorySavedJobRepository extends SavedJobRepository {
  private readonly items = new Map<number, Map<number, Date>>();

  save(candidateId: number, jobId: number, savedAt: Date): Promise<void> {
    const items = this.items.get(candidateId) ?? new Map<number, Date>();
    if (!items.has(jobId)) items.set(jobId, new Date(savedAt));
    this.items.set(candidateId, items);
    return Promise.resolve();
  }

  remove(candidateId: number, jobId: number): Promise<void> {
    this.items.get(candidateId)?.delete(jobId);
    return Promise.resolve();
  }

  savedIds(candidateId: number, jobIds: readonly number[]): Promise<number[]> {
    const items = this.items.get(candidateId);
    return Promise.resolve(
      [...new Set(jobIds)].filter((id) => items?.has(id)).sort((a, b) => a - b),
    );
  }

  list(
    candidateId: number,
    page: number,
    pageSize: number,
  ): Promise<{ items: SavedJob[]; total: number }> {
    const items = [...(this.items.get(candidateId) ?? new Map<number, Date>())]
      .map(([jobId, savedAt]) => ({ jobId, savedAt: new Date(savedAt) }))
      .sort(
        (a, b) =>
          b.savedAt.getTime() - a.savedAt.getTime() || b.jobId - a.jobId,
      );
    return Promise.resolve({
      items: items.slice((page - 1) * pageSize, page * pageSize),
      total: items.length,
    });
  }
}
