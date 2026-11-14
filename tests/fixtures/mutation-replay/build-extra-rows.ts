// Builds extra-rows.json for replay.ts from the PR #2343 round-2 reviewer probe files (#2082).
// Usage: bun tests/fixtures/mutation-replay/build-extra-rows.ts
// Entries stay as the reviewers wrote them; 697 gatekeeper entries are [command, cwd] arrays that replay.ts does not convert.
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const files = [
  '/tmp/rv2343-claude/probe.json', '/tmp/rv2343-claude/probe2.json', '/tmp/rv2343-claude/probe3.json', '/tmp/rv2343-claude/r2/probe.json',
  ...readdirSync('/tmp/gk2082r2').filter(name => /^probe-.*\.json$/.test(name)).sort().map(name => `/tmp/gk2082r2/${name}`),
];
const rows = new Set<unknown>();
for (const file of files) for (const row of JSON.parse(readFileSync(file, 'utf8')) as unknown[]) rows.add(row);
writeFileSync(join(import.meta.dir, 'extra-rows.json'), `${JSON.stringify([...rows])}\n`);
console.log(files.length, rows.size);
