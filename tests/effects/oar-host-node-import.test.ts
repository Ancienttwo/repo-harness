import { expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, realpathSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = join(import.meta.dir, '../..');
test('the actual external-package OAR host bundle imports under Node 24 without loading TypeScript dependencies', async () => {
  const executable = Bun.which('node', { PATH: process.env.PATH ?? '' });
  if (!executable) throw new Error('OAR host import fixture requires Node 24 on PATH');
  const node = realpathSync(executable);
  const runtime = JSON.parse(execFileSync(node, ['-p', 'JSON.stringify({node:process.versions.node,bun:process.versions.bun})'], { encoding: 'utf8', timeout: 10_000 }));
  expect(runtime.bun).toBeUndefined();expect(runtime.node).toMatch(/^24\./);
  const directory = join(root, 'dist');mkdirSync(directory, { recursive: true });
  const outfile = join(directory, `oar-host-import-${randomUUID()}.mjs`);
  try {
    const build = await Bun.build({ entrypoints: [join(root, 'src/effects/review-runner/task-oar-host.ts')],
      target: 'node', format: 'esm', packages: 'external', outdir: directory, naming: basename(outfile) });
    expect(build.success, build.logs.map(String).join('\n')).toBe(true);
    // This must execute Node, not Bun's TS-aware importer. No session/provider starts on import.
    const output = execFileSync(node, ['--input-type=module', '-e',
      `await import(${JSON.stringify(pathToFileURL(outfile).href)});process.stdout.write('node-host-import-ok')`],
      { cwd: root, encoding: 'utf8', timeout: 30_000 });
    expect(output).toBe('node-host-import-ok');
  } finally { rmSync(outfile, { force: true }); }
}, 60_000);
