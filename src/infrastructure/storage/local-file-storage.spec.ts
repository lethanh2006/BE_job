import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { LocalFileStorage } from './local-file-storage';

describe('LocalFileStorage', () => {
  let directory: string;
  let storage: LocalFileStorage;

  beforeEach(async () => {
    directory = join(await mkdtemp(join(tmpdir(), 'jobboard-')), 'files');
    storage = new LocalFileStorage(directory);
  });

  afterEach(async () => {
    await rm(join(directory, '..'), { recursive: true, force: true });
  });

  it('ghi, đọc và xóa tệp; tạo thư mục khi chưa có', async () => {
    const key = randomUUID();

    await storage.put(key, Buffer.from('nội dung'));
    expect((await storage.get(key))!.toString()).toBe('nội dung');
    await storage.delete(key);

    expect(await storage.get(key)).toBeNull();
    expect(await readdir(directory)).toEqual([]);
    await expect(storage.delete(key)).resolves.toBeUndefined();
  });

  it('không ghi đè tệp đã có', async () => {
    const key = randomUUID();
    await storage.put(key, Buffer.from('một'));

    await expect(storage.put(key, Buffer.from('hai'))).rejects.toThrow();
    expect((await storage.get(key))!.toString()).toBe('một');
  });

  it.each([
    '../secret',
    '..',
    'a/b',
    '/etc/passwd',
    'abc',
    `${randomUUID()}/x`,
  ])('từ chối khóa không phải UUID: %s', async (key) => {
    await expect(storage.put(key, Buffer.from('x'))).rejects.toThrow(
      'Khóa tệp',
    );
    await expect(storage.get(key)).rejects.toThrow('Khóa tệp');
    await expect(storage.delete(key)).rejects.toThrow('Khóa tệp');
  });
});
