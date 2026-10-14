import { Candidate } from '../../domain';
import { createDemoCandidate } from '../seed/demo-data';
import { CandidateRepository } from '../../application/abstractions/persistence';

export class InMemoryCandidateRepository extends CandidateRepository {
  private readonly candidates = new Map<number, Candidate>();

  constructor(seedDemoData = false) {
    super();
    if (!seedDemoData) return;

    const candidate = createDemoCandidate();
    this.candidates.set(candidate.id, candidate);
  }

  getById(id: number): Promise<Candidate | null> {
    return Promise.resolve(this.candidates.get(id) ?? null);
  }

  getByIds(ids: readonly number[]): Promise<Candidate[]> {
    return Promise.resolve(ids.flatMap((id) => this.candidates.get(id) ?? []));
  }

  add(entity: Candidate): Promise<void> {
    if (this.candidates.has(entity.id)) {
      return Promise.reject(
        new Error(`Ứng viên có mã ${entity.id} đã tồn tại.`),
      );
    }
    this.candidates.set(entity.id, entity);
    return Promise.resolve();
  }

  update(entity: Candidate): Promise<void> {
    this.candidates.set(entity.id, entity);
    return Promise.resolve();
  }
}
