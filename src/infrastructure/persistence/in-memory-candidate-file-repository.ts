import {
  CandidateFile,
  CandidateFileRepository,
} from '../../application/abstractions/files';
import { JobApplicationRepository } from '../../application/abstractions/persistence';

export class InMemoryCandidateFileRepository extends CandidateFileRepository {
  private readonly files = new Map<string, CandidateFile>();
  private readonly current = new Map<number, string>();

  /** Cần kho đơn ứng tuyển để biết tệp còn được đơn nào tham chiếu hay không. */
  constructor(private readonly applications: JobApplicationRepository) {
    super();
  }

  addAsCurrent(file: CandidateFile): Promise<void> {
    this.files.set(file.id, { ...file });
    this.current.set(file.candidateId, file.id);
    return Promise.resolve();
  }

  getById(id: string): Promise<CandidateFile | null> {
    const file = this.files.get(id);
    return Promise.resolve(file ? { ...file } : null);
  }

  getCurrent(candidateId: number): Promise<CandidateFile | null> {
    const id = this.current.get(candidateId);
    return id ? this.getById(id) : Promise.resolve(null);
  }

  clearCurrent(candidateId: number): Promise<void> {
    this.current.delete(candidateId);
    return Promise.resolve();
  }

  async isReferencedByApplication(fileId: string): Promise<boolean> {
    return (await this.applications.getAll()).some(
      (application) => application.cvFileId === fileId,
    );
  }

  delete(id: string): Promise<void> {
    const file = this.files.get(id);
    if (file && this.current.get(file.candidateId) === id) {
      this.current.delete(file.candidateId);
    }
    this.files.delete(id);
    return Promise.resolve();
  }
}
