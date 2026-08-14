#!/usr/bin/env bun

import { dirname, isAbsolute, relative, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { mkdirSync, renameSync, writeFileSync } from 'fs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = SCRIPT_DIR.endsWith('/assets/templates/helpers')
  ? resolve(SCRIPT_DIR, '../../..')
  : resolve(SCRIPT_DIR, '..');

function usage(): string {
  return 'usage: runtime-evidence-receipt.ts verify --registry <json> --tarball <tgz> --installed-package <dir> --installed-cli <path> --installed-hook <path> --hook-repo <path> --output <repo-relative-json>';
}

function parseArgs(argv: readonly string[]): Record<string, string> {
  if (argv[0] !== 'verify') throw new Error(usage());
  const values: Record<string, string> = {};
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || value === undefined || value.startsWith('--')) throw new Error(usage());
    values[flag.slice(2)] = value;
  }
  return values;
}

function repositoryRoot(cwd = process.cwd()): string {
  const result = Bun.spawnSync(['git', '-C', cwd, 'rev-parse', '--show-toplevel']);
  if (result.exitCode !== 0) throw new Error('runtime evidence receipt requires a git repository');
  return resolve(new TextDecoder().decode(result.stdout).trim());
}

function safeOutput(root: string, path: string): string {
  if (!path || isAbsolute(path) || path.includes('\\') || path.includes('\0')) throw new Error('output must be repository-relative');
  const absolute = resolve(root, path);
  const value = relative(root, absolute);
  if (!value || value === '..' || value.startsWith('../') || isAbsolute(value)) throw new Error(`output escapes repository: ${path}`);
  return absolute;
}

function atomicWrite(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

async function main(argv: readonly string[]): Promise<void> {
  const values = parseArgs(argv);
  const required = ['registry', 'tarball', 'installed-package', 'installed-cli', 'installed-hook', 'hook-repo', 'output'] as const;
  for (const key of required) if (!values[key]) throw new Error(`--${key} is required`);
  const root = repositoryRoot();
  const pkg = await Bun.file(resolve(root, 'package.json')).json() as { name?: unknown; version?: unknown };
  if (typeof pkg.name !== 'string' || typeof pkg.version !== 'string') throw new Error('package.json name/version are required');
  const effects = await import(pathToFileURL(resolve(PACKAGE_ROOT, 'src/effects/release/runtime-evidence.ts')).href) as typeof import('../src/effects/release/runtime-evidence');
  const receipt = effects.collectRuntimeEvidence({
    packageName: pkg.name,
    packageVersion: pkg.version,
    registryReadbackPath: values.registry!,
    tarballPath: values.tarball!,
    installedPackagePath: values['installed-package']!,
    installedCliPath: values['installed-cli']!,
    installedHookPath: values['installed-hook']!,
    hookRepo: values['hook-repo']!,
  });
  const output = safeOutput(root, values.output!);
  atomicWrite(output, receipt);
  process.stdout.write(`runtime-evidence-receipt: valid ${receipt.receipt_sha256}\n`);
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`runtime-evidence-receipt: ${(error as Error).message}\n${usage()}\n`);
    process.exit(2);
  });
}
