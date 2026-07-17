import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const required = [
  'package.json',
  'compose.yaml',
  'Dockerfile.node',
  '.env.example',
  'apps/api/src/main.ts',
  'apps/api/src/app.module.ts',
  'apps/worker/src/main.ts',
  'apps/web/src/App.tsx',
  'apps/web/Dockerfile',
  'packages/contracts/src/index.ts',
  'packages/database/src/migrate.ts',
  'packages/database/migrations/0001_phase2_foundation.sql',
  'docs/openapi/warehouse-v1.yaml',
  'docs/architecture/phase-2-architecture.md',
  'docs/architecture/module-boundaries.md',
  'docs/architecture/phase-2-gate.md',
  'docs/adr/0001-modular-monolith.md',
  'docs/adr/0002-postgresql-sql-first.md',
  'docs/adr/0003-whole-case-quantity.md',
  '.github/workflows/ci.yml'
];

const failures = [];
for (const file of required) {
  try {
    const info = await stat(join(root, file));
    if (!info.isFile()) failures.push(`${file}: not a file`);
  } catch {
    failures.push(`${file}: missing`);
  }
}

const openapi = await readFile(join(root, 'docs/openapi/warehouse-v1.yaml'), 'utf8');
for (const marker of ['openapi: 3.1.0', '/api/v1/health:', 'X-Correlation-Id', 'Idempotency-Key', 'ProblemDetails']) {
  if (!openapi.includes(marker)) failures.push(`OpenAPI missing ${marker}`);
}

const migration = await readFile(join(root, 'packages/database/migrations/0001_phase2_foundation.sql'), 'utf8');
for (const marker of ['CREATE SCHEMA IF NOT EXISTS platform', 'CREATE TABLE platform.idempotency_record', 'CREATE TABLE platform.outbox_event', 'CREATE TABLE audit.audit_event']) {
  if (!migration.includes(marker)) failures.push(`Migration missing ${marker}`);
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (['node_modules', 'dist'].includes(entry.name)) continue;
    const full = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

for (const file of await walk(join(root, 'apps'))) {
  const source = await readFile(file, 'utf8');
  if (/from ['"][^'"]*modules\/[^/'"]+\/(infrastructure|internal)/.test(source)) {
    failures.push(`${relative(root, file)} imports another module's internals`);
  }
}

if (failures.length) {
  console.error('Phase 2 foundation verification failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Phase 2 foundation verified: ${required.length} required artifacts and architecture rules passed.`);
