import { ApplicationStatus, JobApplication } from '../../domain';
import { JobApplicationRepository } from '../../application/abstractions/persistence';

export class InMemoryJobApplicationRepository extends JobApplicationRepository {
  private readonly applications = new Map<number, JobApplication>();
  private lastId = 0;

  constructor(seedDemoData = false) {
    super();
    if (!seedDemoData) return;

    const seeds = [
      new JobApplication(
        1,
        2,
        20,
        new Date('2026-09-25T08:00:00Z'),
        ApplicationStatus.Reviewing,
      ),
      new JobApplication(
        2,
        5,
        20,
        new Date('2026-09-21T08:00:00Z'),
        ApplicationStatus.Submitted,
      ),
      new JobApplication(
        3,
        6,
        20,
        new Date('2026-09-12T08:00:00Z'),
        ApplicationStatus.Rejected,
      ),
    ];
    seeds.forEach((application) =>
      this.applications.set(application.id, application),
    );
    this.lastId = Math.max(...seeds.map((application) => application.id));
  }

  getById(id: number): Promise<JobApplication | null> {
    return Promise.resolve(this.applications.get(id) ?? null);
  }

  add(entity: JobApplication): Promise<void> {
    if (this.applications.has(entity.id)) {
      return Promise.reject(
        new Error(`Đơn ứng tuyển có mã ${entity.id} đã tồn tại.`),
      );
    }
    this.applications.set(entity.id, entity);
    this.lastId = Math.max(this.lastId, entity.id);
    return Promise.resolve();
  }

  update(entity: JobApplication): Promise<void> {
    this.applications.set(entity.id, entity);
    return Promise.resolve();
  }

  getNextId(): Promise<number> {
    return Promise.resolve(++this.lastId);
  }

  getAll(): Promise<JobApplication[]> {
    return Promise.resolve([...this.applications.values()]);
  }

  hasApplied(candidateId: number, jobId: number): Promise<boolean> {
    return Promise.resolve(
      [...this.applications.values()].some(
        (a) => a.candidateId === candidateId && a.jobId === jobId,
      ),
    );
  }

  getByCandidateId(candidateId: number): Promise<JobApplication[]> {
    return Promise.resolve(this.sortedBy((a) => a.candidateId === candidateId));
  }

  getByJobId(jobId: number): Promise<JobApplication[]> {
    return Promise.resolve(this.sortedBy((a) => a.jobId === jobId));
  }

  private sortedBy(
    predicate: (a: JobApplication) => boolean,
  ): JobApplication[] {
    return [...this.applications.values()]
      .filter(predicate)
      .sort((a, b) => b.appliedAt.getTime() - a.appliedAt.getTime());
  }
}
