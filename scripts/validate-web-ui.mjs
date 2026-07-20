import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]):/, '$1:');
const webSource = join(root, 'apps', 'web', 'src');
const files = [
  'App.tsx',
  'apiClient.ts',
  'hooks/useAuth.ts',
  'hooks/useApproval.ts',
  'hooks/useInbound.ts',
  'hooks/useInventory.ts',
  'hooks/useOutbound.ts',
  'hooks/useQuality.ts',
  'views/DashboardView.tsx',
  'views/FinancialView.tsx',
  'views/InboundView.tsx',
  'views/InventoryView.tsx',
  'views/OutboundView.tsx',
  'views/QualityView.tsx'
];

const failures = [];
for (const relative of files) {
  const source = await readFile(join(webSource, relative), 'utf8');
  if (relative !== 'apiClient.ts' && /\bfetch\s*\(/.test(source)) failures.push(`${relative}: direct fetch bypasses apiClient`);
  if (/\balert\s*\(/.test(source)) failures.push(`${relative}: alert() is not allowed for business commands`);
}
const backlog = await readFile(join(root, 'docs', 'web-ui-completion-backlog.md'), 'utf8');
for (const id of ['UI-001', 'UI-002', 'UI-003', 'UI-004', 'UI-005', 'UI-006', 'UI-007', 'UI-008', 'UI-009', 'UI-010']) {
  if (!backlog.includes(id)) failures.push(`backlog: missing ${id}`);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Validated ${files.length} Web UI source files and backlog controls.`);
}
