import { join } from 'node:path';

/** File JSON chứa tin tuyển dụng mẫu (được copy sang dist khi build). */
export const JOB_SEED_FILE = join(
  __dirname,
  '..',
  '..',
  'data',
  'seed',
  'jobs.json',
);
