import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const command = process.argv[2] ?? 'up';
const connectionString = process.env.DATABASE_URL;

if (!connectionString) throw new Error('DATABASE_URL is required. Copy .env.example to .env or export the variable.');

const client = new Client({ connectionString });

async function bootstrap(): Promise<void> {
  await client.query('CREATE SCHEMA IF NOT EXISTS platform');
  await client.query(`
    CREATE TABLE IF NOT EXISTS platform.schema_migration (
      version text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function loadMigrations() {
  const names = (await readdir(migrationsDir)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
  return Promise.all(names.map(async (name) => {
    const sql = await readFile(join(migrationsDir, name), 'utf8');
    return { version: name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
  }));
}

async function main(): Promise<void> {
  await client.connect();
  await client.query("SELECT pg_advisory_lock(hashtext('warehouse-wms-migrations'))");
  try {
    await bootstrap();
    const migrations = await loadMigrations();
    const appliedResult = await client.query<{ version: string; checksum: string }>(
      'SELECT version, checksum FROM platform.schema_migration ORDER BY version'
    );
    const applied = new Map(appliedResult.rows.map((row) => [row.version, row.checksum]));

    for (const migration of migrations) {
      const previous = applied.get(migration.version);
      if (previous && previous !== migration.checksum) {
        throw new Error(`Checksum mismatch for applied migration ${migration.version}`);
      }
    }

    if (command === 'status') {
      for (const migration of migrations) {
        console.log(`${applied.has(migration.version) ? 'applied' : 'pending'} ${migration.version}`);
      }
      return;
    }
    if (command !== 'up') throw new Error(`Unsupported migration command: ${command}`);

    for (const migration of migrations.filter((item) => !applied.has(item.version))) {
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO platform.schema_migration(version, checksum) VALUES ($1, $2)',
          [migration.version, migration.checksum]
        );
        await client.query('COMMIT');
        console.log(`applied ${migration.version}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('warehouse-wms-migrations'))");
    await client.end();
  }
}

void main();
