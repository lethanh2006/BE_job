import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FileStorage } from '../../application/abstractions/files';

const KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Lưu tệp trên đĩa cục bộ; khóa phải là UUID nên không thể thoát khỏi thư mục gốc (path traversal). */
export class LocalFileStorage extends FileStorage {
  constructor(private readonly directory: string) {
    super();
  }

  async put(key: string, content: Buffer): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o750 });
    // wx: không ghi đè tệp đã có (khóa UUID ngẫu nhiên nên va chạm gần như không xảy ra).
    await writeFile(this.pathOf(key), content, { flag: 'wx', mode: 0o640 });
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathOf(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }

  private pathOf(key: string): string {
    if (!KEY_PATTERN.test(key)) {
      throw new Error('Khóa tệp không hợp lệ.');
    }
    return join(this.directory, key);
  }
}
