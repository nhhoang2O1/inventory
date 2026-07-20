import pg from 'pg';

const { Pool } = pg;

/**
 * One bounded pool per API process. Domain database services intentionally share
 * this pool so a single instance cannot multiply PostgreSQL connections by the
 * number of Nest modules.
 */
export const sharedDatabasePool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX ?? 20),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 30_000),
  connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS ?? 5_000)
});
