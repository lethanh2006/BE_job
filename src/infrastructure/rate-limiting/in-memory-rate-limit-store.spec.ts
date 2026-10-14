import { InMemoryRateLimitStore } from './in-memory-rate-limit-store';

const WINDOW = 60_000;

describe('InMemoryRateLimitStore', () => {
  it('đếm trong cửa sổ cố định và mở cửa sổ mới khi hết hạn', async () => {
    const store = new InMemoryRateLimitStore();

    expect(await store.hit('a', WINDOW, 1_000)).toEqual({
      count: 1,
      resetAt: 61_000,
    });
    expect(await store.hit('a', WINDOW, 30_000)).toEqual({
      count: 2,
      resetAt: 61_000,
    });
    expect(await store.hit('a', WINDOW, 61_000)).toEqual({
      count: 1,
      resetAt: 121_000,
    });
  });

  it('mỗi khóa có bộ đếm riêng; peek không cộng thêm; reset xóa bộ đếm', async () => {
    const store = new InMemoryRateLimitStore();
    await store.hit('a', WINDOW, 0);
    await store.hit('a', WINDOW, 0);
    await store.hit('b', WINDOW, 0);

    expect((await store.peek('a', 10))?.count).toBe(2);
    expect((await store.peek('a', 10))?.count).toBe(2);
    expect((await store.peek('b', 10))?.count).toBe(1);
    expect(await store.peek('a', WINDOW)).toBeNull();
    expect(await store.peek('khong-co', 0)).toBeNull();

    await store.reset('a');
    expect(await store.peek('a', 10)).toBeNull();
    expect((await store.peek('b', 10))?.count).toBe(1);
  });

  it('kết quả trả về là bản sao, sửa nó không đổi bộ đếm', async () => {
    const store = new InMemoryRateLimitStore();
    const counter = await store.hit('a', WINDOW, 0);

    counter.count = 999;

    expect((await store.peek('a', 1))?.count).toBe(1);
  });

  it('giới hạn số khóa: dọn bản ghi hết hạn trước, rồi bỏ bản ghi cũ nhất', async () => {
    const store = new InMemoryRateLimitStore(3);
    await store.hit('cu', 1_000, 0);
    await store.hit('b', WINDOW, 0);
    await store.hit('c', WINDOW, 0);

    // 'cu' đã hết hạn nên được dọn để lấy chỗ cho khóa mới.
    await store.hit('d', WINDOW, 5_000);
    expect(await store.peek('cu', 5_000)).toBeNull();
    expect(await store.peek('b', 5_000)).not.toBeNull();

    // Không còn bản ghi hết hạn: bỏ bản ghi chèn sớm nhất ('b').
    await store.hit('e', WINDOW, 5_000);
    expect(await store.peek('b', 5_000)).toBeNull();
    expect(await store.peek('c', 5_000)).not.toBeNull();
    expect(await store.peek('d', 5_000)).not.toBeNull();
    expect(await store.peek('e', 5_000)).not.toBeNull();
  });
});
