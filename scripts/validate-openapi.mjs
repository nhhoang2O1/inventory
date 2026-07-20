import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const docsDir = path.resolve('docs', 'openapi');
const files = (await readdir(docsDir)).filter((name) => name.endsWith('.yaml') || name.endsWith('.yml')).sort();
if (files.length === 0) throw new Error('No OpenAPI documents found');

for (const file of files) {
  const source = await readFile(path.join(docsDir, file), 'utf8');
  if (!/^openapi:\s*3\.[01]\./m.test(source)) throw new Error(`${file}: missing OpenAPI 3.x declaration`);
  if (!/^info:\s*/m.test(source) || !/^paths:\s*$/m.test(source) || !/^components:\s*$/m.test(source)) {
    throw new Error(`${file}: info, paths and components sections are required`);
  }
  const pathKeys = [...source.matchAll(/^  (\/[^:]+):\s*$/gm)].map((match) => match[1]);
  if (new Set(pathKeys).size !== pathKeys.length) throw new Error(`${file}: duplicate path key`);
}
console.log(`Validated ${files.length} OpenAPI documents.`);
