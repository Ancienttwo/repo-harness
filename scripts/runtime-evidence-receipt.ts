#!/usr/bin/env bun

import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = SCRIPT_DIR.endsWith('/assets/templates/helpers')
  ? resolve(SCRIPT_DIR, '../../..')
  : resolve(SCRIPT_DIR, '..');

function usage(): string {
  return 'usage: runtime-evidence-receipt.ts verify --registry <json> --tarball <tgz> --installed-package <dir> --installed-cli <path> --installed-hook <path> --hook-repo <path>';
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

async function main(argv: readonly string[]): Promise<void> {
  const values = parseArgs(argv);
  const required: readonly string[] = ['registry', 'tarball', 'installed-package', 'installed-cli', 'installed-hook', 'hook-repo'];
  for (const key of Object.keys(values)) if (!required.includes(key)) throw new Error(`--${key} is not a verify option`);
  for (const key of required) if (!values[key]) throw new Error(`--${key} is required`);
  const root = repositoryRoot();
  const pkg = await Bun.file(resolve(root, 'package.json')).json() as { name?: unknown; version?: unknown };
  if (typeof pkg.name !== 'string' || typeof pkg.version !== 'string') throw new Error('package.json name/version are required');
  const effects = await import(pathToFileURL(resolve(PACKAGE_ROOT, 'src/effects/release/runtime-evidence.ts')).href) as typeof import('../src/effects/release/runtime-evidence');
  const observations = effects.collectRuntimeEvidence({
    packageName: pkg.name,
    packageVersion: pkg.version,
    registryReadbackPath: values.registry!,
    tarballPath: values.tarball!,
    installedPackagePath: values['installed-package']!,
    installedCliPath: values['installed-cli']!,
    installedHookPath: values['installed-hook']!,
    hookRepo: values['hook-repo']!,
  });
  process.stdout.write(`runtime-evidence-receipt: valid ${observations.map((entry) => entry.invariant).join(', ')}\n`);
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`runtime-evidence-receipt: ${(error as Error).message}\n${usage()}\n`);
    process.exit(2);
  });
}
