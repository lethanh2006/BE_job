import { Candidate, SalaryRange, Skill } from '../../domain';
import { CandidateRepository } from '../../application/abstractions/persistence';

export class InMemoryCandidateRepository extends CandidateRepository {
  private readonly candidates = new Map<number, Candidate>();

  constructor(seedDemoData = false) {
    super();
    if (!seedDemoData) return;

    const candidate = new Candidate(
      20,
      'Nguyễn Minh An',
      'an@example.com',
      'Backend Developer yêu thích sản phẩm có tác động thực tế và những hệ thống được thiết kế chỉn chu.',
      new SalaryRange(1800, 2800),
    );
    ['C#', 'ASP.NET Core', 'PostgreSQL', 'Docker'].forEach((skill) =>
      candidate.addSkill(new Skill(skill)),
    );
    this.candidates.set(candidate.id, candidate);
  }

  getById(id: number): Promise<Candidate | null> {
    return Promise.resolve(this.candidates.get(id) ?? null);
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
