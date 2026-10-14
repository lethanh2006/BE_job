import type { Queryable } from '../database';

export interface Migration {
  /** Mã duy nhất, sắp xếp theo thứ tự áp dụng (ví dụ `0001_initial_schema`). */
  id: string;
  up(db: Queryable): Promise<void>;
}
