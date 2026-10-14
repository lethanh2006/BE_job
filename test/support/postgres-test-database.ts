import { Client } from 'pg';

/** Tạo database tạm cho một lần chạy test và trả về cách dọn dẹp. */
export async function createTestDatabase(adminUrl: string) {
  const name = `jobboard_e2e_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const withAdmin = async (sql: string) => {
    const client = new Client({ connectionString: adminUrl });
    await client.connect();
    try {
      await client.query(sql);
    } finally {
      await client.end();
    }
  };

  await withAdmin(`CREATE DATABASE ${name}`);
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;

  return {
    name,
    url: url.toString(),
    drop: () => withAdmin(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`),
  };
}

export const E2E_POSTGRES_URL = process.env.E2E_POSTGRES_URL;
