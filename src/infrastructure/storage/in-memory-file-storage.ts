import { FileStorage } from '../../application/abstractions/files';

export class InMemoryFileStorage extends FileStorage {
  private readonly files = new Map<string, Buffer>();

  put(key: string, content: Buffer): Promise<void> {
    this.files.set(key, Buffer.from(content));
    return Promise.resolve();
  }

  get(key: string): Promise<Buffer | null> {
    const content = this.files.get(key);
    return Promise.resolve(content ? Buffer.from(content) : null);
  }

  delete(key: string): Promise<void> {
    this.files.delete(key);
    return Promise.resolve();
  }

  get size(): number {
    return this.files.size;
  }
}
