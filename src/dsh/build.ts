import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Builds `dist/dsh/`, the nested package that DSH loads from the bundle patch
 * row `./dist/dsh/plugin.js`. DSH's client module scan reads the nearest
 * `package.json` above that file, so this directory carries its own manifest
 * with `dsh.client` and `exports["./client"]`.
 *
 * DSH provides `@deepseek-ai/*` packages and React at runtime. Neither bundle
 * may contain an import of them that DSH cannot answer, so both outputs are
 * checked for the `@deepseek-ai/` string.
 */

const ROOT = join(import.meta.dir, '../..');
const OUT = join(ROOT, 'dist/dsh');
const MANIFEST = JSON.parse(readFileSync(join(import.meta.dir, 'package.dist.json'), 'utf8')) as { name: string };

async function bundle(options: Parameters<typeof Bun.build>[0]): Promise<string> {
  const result = await Bun.build(options);
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error(`dsh build failed: ${options.entrypoints.join(', ')}`);
  }
  const [artifact] = result.outputs;
  if (!artifact || result.outputs.length !== 1) throw new Error('dsh build must emit exactly one file per entry');
  return artifact.text();
}

function assertNoDshImports(name: string, text: string): void {
  if (text.includes('@deepseek-ai/')) throw new Error(`dist/dsh/${name} must not reference @deepseek-ai/ packages`);
}

const host = await bundle({
  entrypoints: [join(import.meta.dir, 'plugin.ts')],
  target: 'node',
  format: 'esm',
  // zod ships inside the bundle: the profile that installs repo-harness has no copy of it.
  external: ['@deepseek-ai/*'],
});
assertNoDshImports('plugin.js', host);

// DSH loads a client bundle as one lazy CommonJS factory registered with its
// module loader; `require` resolves only the shell's shared module table.
const clientBody = await bundle({
  entrypoints: [join(import.meta.dir, 'client.tsx')],
  target: 'browser',
  format: 'cjs',
  // The shell's module table answers `react/jsx-runtime`, not the dev runtime.
  jsx: { runtime: 'automatic', importSource: 'react', development: false },
  external: ['react', 'react/jsx-runtime'],
});
assertNoDshImports('client.js', clientBody);
const client = [
  'window.__ModuleLoader__.load({',
  `\tid: ${JSON.stringify(MANIFEST.name)},`,
  '\tfactory: (require) => {',
  '\t\tvar module = { exports: {} };',
  '\t\tvar exports = module.exports;',
  clientBody,
  '\t\treturn module.exports;',
  '\t}',
  '});',
  '',
].join('\n');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'plugin.js'), host);
writeFileSync(join(OUT, 'client.js'), client);
copyFileSync(join(import.meta.dir, 'package.dist.json'), join(OUT, 'package.json'));
