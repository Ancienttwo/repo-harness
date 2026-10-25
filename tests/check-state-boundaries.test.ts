import { afterAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  checkStateBoundaries,
  type StateBoundaryCheckResult,
} from '../scripts/check-state-boundaries';

const ROOT = join(import.meta.dir, '..');
const CHECKER = join(ROOT, 'scripts/check-state-boundaries.ts');
const FIXTURES = new Set<string>();

function write(root: string, path: string, content: string): void {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function sourceHash(root: string): string {
  return createHash('sha256')
    .update(readFileSync(join(root, 'src/core/capabilities/registry.ts')))
    .digest('hex');
}

function createFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-state-boundaries-'));
  FIXTURES.add(root);

  for (const path of [
    'src/core/state',
    'src/core/workflow',
    'src/core/capabilities',
  ]) {
    cpSync(join(ROOT, path), join(root, path), { recursive: true });
  }
  write(root, 'src/effects/state/placeholder.ts', 'export {};\n');
  cpSync(
    join(ROOT, 'src/cli/hook/state-snapshot.ts'),
    join(root, 'src/cli/hook/state-snapshot.ts'),
  );
  cpSync(
    join(ROOT, 'scripts/capability-resolver.ts'),
    join(root, 'scripts/capability-resolver.ts'),
  );
  write(
    root,
    'tsconfig.json',
    `${JSON.stringify({
      compilerOptions: {
        module: 'Preserve',
        moduleResolution: 'Bundler',
        noEmit: true,
        strict: true,
        target: 'ES2022',
        types: [],
      },
      include: ['src/**/*.ts', 'scripts/capability-resolver.ts'],
    }, null, 2)}\n`,
  );
  const projectionPath = join(root, 'assets/templates/helpers/capability-resolver.ts');
  mkdirSync(dirname(projectionPath), { recursive: true });
  cpSync(join(ROOT, 'assets/templates/helpers/capability-resolver.ts'), projectionPath);
  return root;
}

async function checkWith(
  mutate?: (root: string) => void,
): Promise<{ root: string; result: StateBoundaryCheckResult }> {
  const root = createFixture();
  mutate?.(root);
  return { root, result: await checkStateBoundaries(root) };
}

function codes(result: StateBoundaryCheckResult): string[] {
  return result.violations.map((item) => item.code);
}

function messages(result: StateBoundaryCheckResult, code: string): string[] {
  return result.violations.filter((item) => item.code === code).map((item) => item.message);
}

afterAll(() => {
  for (const root of FIXTURES) rmSync(root, { recursive: true, force: true });
});

describe('state architecture boundary checker', () => {
  test('accepts the canonical core/effects/adapter layout and source-bound helper', async () => {
    const { result } = await checkWith();
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.filesChecked).toBeGreaterThan(5);
  });

  test('rejects every forbidden core runtime module in static imports', async () => {
    const forbidden = [
      'fs',
      'node:fs',
      'path',
      'node:path',
      'child_process',
      'node:child_process',
      'process',
      'node:process',
      'commander',
      '@modelcontextprotocol/sdk/server/index.js',
    ];
    const { result } = await checkWith((root) => {
      write(
        root,
        'src/core/state/forbidden-imports.ts',
        `${forbidden.map((specifier, index) =>
          `import * as forbidden${index} from ${JSON.stringify(specifier)};`).join('\n')}\n`,
      );
    });
    const violations = result.violations.filter((item) => item.code === 'CORE_FORBIDDEN_IMPORT');
    expect(result.ok).toBe(false);
    expect(violations).toHaveLength(forbidden.length);
    for (const specifier of forbidden) {
      expect(violations.some((item) => item.message.includes(specifier))).toBe(true);
    }
  });

  test('checks every src/core subdirectory and exempts no file', async () => {
    const { result } = await checkWith((root) => {
      write(
        root,
        'src/core/upgrade/inventory.ts',
        "import { readFileSync } from 'fs';\nimport { hashManagedTree } from '../../cli/installer/install-profile';\n",
      );
      write(root, 'src/core/adoption/plan.ts', "import { join } from 'path';\n");
    });
    expect(result.violations.map((item) => `${item.code} ${item.file}`)).toEqual([
      'CORE_FORBIDDEN_IMPORT src/core/adoption/plan.ts',
      'CORE_FORBIDDEN_IMPORT src/core/upgrade/inventory.ts',
      'CORE_REVERSE_IMPORT src/core/upgrade/inventory.ts',
    ]);
  });

  test('checks literal and non-literal dynamic loads and reverse core dependencies', async () => {
    const { result } = await checkWith((root) => {
      write(
        root,
        'src/core/state/dynamic-imports.ts',
        [
          "const target = 'node:path';",
          'export async function loadForbiddenModules(): Promise<void> {',
          "  await import('node:fs');",
          "  await import('../../cli/hook/state-snapshot');",
          "  await import('../../effects/state/placeholder');",
          '  await import(target);',
          '}',
          '',
        ].join('\n'),
      );
    });
    expect(codes(result)).toContain('CORE_FORBIDDEN_IMPORT');
    expect(messages(result, 'CORE_REVERSE_IMPORT')).toHaveLength(2);
    expect(codes(result)).toContain('CORE_DYNAMIC_IMPORT_UNRESOLVED');
  });

  test('rejects src imports of the scripts layer', async () => {
    const { result } = await checkWith((root) => {
      write(
        root,
        'src/effects/state/imports-script.ts',
        [
          "import '../../../scripts/capability-resolver';",
          "export async function load(): Promise<void> {",
          "  await import('../../../scripts/capability-resolver');",
          '}',
          "export type ScriptType = import('../../../scripts/capability-resolver').CapabilitySourceError;",
          '',
        ].join('\n'),
      );
    });
    expect(result.ok).toBe(false);
    expect(messages(result, 'SRC_SCRIPT_IMPORT')).toHaveLength(3);
  });

  test('forbids effect modules from importing CLI adapters', async () => {
    const { result } = await checkWith((root) => {
      write(
        root,
        'src/effects/state/reverse-cli.ts',
        [
          "import '../../cli/hook/state-snapshot';",
          "export async function load(): Promise<void> { await import('../../cli/hook/state-snapshot'); }",
          '',
        ].join('\n'),
      );
    });
    expect(messages(result, 'EFFECTS_REVERSE_IMPORT')).toHaveLength(2);
  });

  test('reports an intra-layer directory cycle across import forms', async () => {
    const { result } = await checkWith((root) => {
      write(root, 'src/effects/alpha/a.ts', "export { b } from '../beta/b';\nexport const a = 1;\n");
      write(root, 'src/effects/beta/b.ts', "export const b = 2;\nexport type A = typeof import('../alpha/a').a;\n");
    });
    expect(result.violations.map((item) => `${item.code} ${item.file}:${item.line}`)).toEqual([
      'INTRA_LAYER_CYCLE src/effects/alpha/a.ts:1',
    ]);
    expect(messages(result, 'INTRA_LAYER_CYCLE')).toEqual([
      'intra-layer directory cycle src/effects/alpha <-> src/effects/beta: '
        + 'src/effects/alpha/a.ts:1 imports ../beta/b; src/effects/beta/b.ts:2 imports ../alpha/a',
    ]);

    const dynamic = await checkWith((root) => {
      write(root, 'src/cli/alpha/a.ts', "export async function load(): Promise<unknown> { return import('../beta/b'); }\n");
      write(root, 'src/cli/beta/b.ts', "import '../alpha/a';\n");
    });
    expect(messages(dynamic.result, 'INTRA_LAYER_CYCLE')).toEqual([
      expect.stringContaining('src/cli/alpha <-> src/cli/beta'),
    ]);
  });

  test('accepts an allowed cycle and rejects a stale allowance', async () => {
    const pair = 'src/effects/alpha <-> src/effects/beta';
    const cyclic = createFixture();
    write(cyclic, 'src/effects/alpha/a.ts', "import '../beta/b';\n");
    write(cyclic, 'src/effects/beta/b.ts', "import '../alpha/a';\n");
    const allowed = await checkStateBoundaries(cyclic, { [pair]: 'fixture reason' });
    expect(allowed.ok).toBe(true);
    expect(allowed.violations).toEqual([]);

    const acyclic = createFixture();
    write(acyclic, 'src/effects/alpha/a.ts', "import '../beta/b';\n");
    write(acyclic, 'src/effects/beta/b.ts', 'export {};\n');
    const stale = await checkStateBoundaries(acyclic, { [pair]: 'fixture reason' });
    expect(stale.violations.map((item) => `${item.code} ${item.file}`)).toEqual([
      'INTRA_LAYER_CYCLE_ALLOWANCE_STALE src/effects/alpha',
    ]);
  });

  test('ignores one-way, top-level-file and cross-layer directory imports', async () => {
    const { result } = await checkWith((root) => {
      write(root, 'src/effects/alpha/a.ts', "import '../beta/b';\nimport '../top';\n");
      write(root, 'src/effects/beta/b.ts', "import '../top';\n");
      write(root, 'src/effects/top.ts', "import './alpha/a';\nimport './beta/b';\n");
      write(root, 'src/cli/alpha/a.ts', "import '../../effects/alpha/a';\n");
    });
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  test('rejects process execution from pure core', async () => {
    const { result } = await checkWith((root) => {
      write(
        root,
        'src/core/state/process-execution.ts',
        [
          'declare const spawnSync: (command: string) => unknown;',
          'export function execute(): void {',
          '  process.exit(1);',
          "  Bun.spawn(['echo']);",
          "  spawnSync('echo');",
          "  new Deno.Command('echo');",
          '  Bun.$`echo`;',
          '}',
          '',
        ].join('\n'),
      );
    });
    expect(messages(result, 'CORE_PROCESS_EXECUTION')).toHaveLength(5);
  }, 30_000);

  test('keeps canonical symbols in their core owners and catches renamed CLI authority', async () => {
    const { result } = await checkWith((root) => {
      write(
        root,
        'src/cli/redeclared-authority.ts',
        [
          'export function resolveWorkflowProfile(): string { return "lite"; }',
          'export function validateCapabilityRegistryValue(): boolean { return true; }',
          'export function parseAllowedPaths(): string[] { return []; }',
          'export function calculateWorkflowProfile(): string { return "strict"; }',
          '',
        ].join('\n'),
      );
    });
    expect(messages(result, 'CANONICAL_SYMBOL_OWNER')).toHaveLength(3);
    expect(messages(result, 'CLI_AUTHORITY_REDECLARATION')).toEqual([
      expect.stringContaining('calculateWorkflowProfile'),
    ]);
  });

  test('rejects migrated artifact-authority names when they reappear in CLI adapters', async () => {
    const { result } = await checkWith((root) => {
      write(
        root,
        'src/cli/redeclared-artifact-authority.ts',
        [
          'export function getPlanStatus(): string { return "Executing"; }',
          'export function artifactStemFromPlanPath(): string { return "task"; }',
          'export function evidenceContractComplete(): boolean { return true; }',
          'export function planContractRelationshipConflicts(): string[] { return []; }',
          '',
        ].join('\n'),
      );
    });
    expect(messages(result, 'CLI_AUTHORITY_REDECLARATION')).toEqual([
      expect.stringContaining('getPlanStatus'),
      expect.stringContaining('artifactStemFromPlanPath'),
    ]);
    expect(messages(result, 'CANONICAL_SYMBOL_OWNER')).toEqual([
      expect.stringContaining('evidenceContractComplete'),
      expect.stringContaining('planContractRelationshipConflicts'),
    ]);
  });

  test('requires the standalone capability script to import canonical registry operations', async () => {
    const { result } = await checkWith((root) => {
      write(
        root,
        'scripts/capability-resolver.ts',
        'export function parseCapabilityRegistry(): object { return {}; }\n',
      );
    });
    expect(codes(result)).toContain('CAPABILITY_HELPER_NOT_CANONICAL');
    expect(codes(result)).toContain('CANONICAL_SYMBOL_OWNER');
  });

  test('forbids the retired adapter re-export path', async () => {
    const { result } = await checkWith((root) => {
      write(
        root,
        'src/cli/hook/workflow-profile.ts',
        "export * from '../../core/workflow/profile';\n",
      );
    });
    expect(codes(result)).toContain('RETIRED_ADAPTER_PATH');
  });

  test('keeps state-snapshot free of parser, Git, lock, cache, and host-I/O authority', async () => {
    const { result } = await checkWith((root) => {
      write(
        root,
        'src/cli/hook/state-snapshot.ts',
        [
          "import { readFileSync } from 'node:fs';",
          "const stateCache = readFileSync('cache.json', 'utf8');",
          'export function runStateSnapshotCli(): boolean {',
          '  return /allowed_paths/.test(stateCache);',
          '}',
          '',
        ].join('\n'),
      );
    });
    expect(result.ok).toBe(false);
    expect(messages(result, 'STATE_SNAPSHOT_AUTHORITY').length).toBeGreaterThanOrEqual(4);
  });

  test('recomputes the generated helper source hash and requires one exact marker', async () => {
    const stale = await checkWith((root) => {
      write(
        root,
        'src/core/capabilities/registry.ts',
        `${readFileSync(join(root, 'src/core/capabilities/registry.ts'), 'utf8')}\n// source changed\n`,
      );
    });
    expect(codes(stale.result)).toContain('CAPABILITY_PROJECTION_HASH');

    const missing = await checkWith((root) => {
      write(root, 'assets/templates/helpers/capability-resolver.ts', '// no source marker\n');
    });
    expect(codes(missing.result)).toContain('CAPABILITY_PROJECTION_MARKER');

    const wrongSource = await checkWith((root) => {
      write(
        root,
        'assets/templates/helpers/capability-resolver.ts',
        `// @generated-from src/cli/capabilities.ts sha256:${sourceHash(root)}\n`,
      );
    });
    expect(codes(wrongSource.result)).toContain('CAPABILITY_PROJECTION_SOURCE');
  });

  test('never executes target-owned projection scripts while checking an arbitrary root', async () => {
    const noExecRoot = mkdtempSync(join(tmpdir(), 'repo-harness-boundary-no-exec-'));
    FIXTURES.add(noExecRoot);
    const marker = join(noExecRoot, 'executed');
    const safe = await checkWith((root) => {
      write(
        root,
        'scripts/sync-helper-sources.ts',
        `await Bun.write(${JSON.stringify(marker)}, 'executed');\n`,
      );
    });
    expect(safe.result.ok).toBe(true);
    expect(() => readFileSync(marker, 'utf8')).toThrow();
  });

  test('fails closed on TypeScript syntax errors and missing architecture roots', async () => {
    const syntax = await checkWith((root) => {
      write(root, 'src/core/state/broken.ts', 'export function broken( {\n');
    });
    expect(codes(syntax.result)).toContain('TYPESCRIPT_SYNTAX_ERROR');

    const missingRoot = await checkWith((root) => {
      rmSync(join(root, 'src/core'), { recursive: true, force: true });
    });
    expect(codes(missingRoot.result)).toContain('REQUIRED_PATH_MISSING');

    const missingOwner = await checkWith((root) => {
      rmSync(join(root, 'src/core/workflow'), { recursive: true, force: true });
    });
    expect(codes(missingOwner.result)).toContain('CANONICAL_SYMBOL_MISSING');
  });

  test('CLI output is deterministic, actionable, and non-zero on a violation', () => {
    const root = createFixture();
    write(root, 'src/core/state/forbidden.ts', "import 'node:fs';\n");
    const run = spawnSync('bun', [CHECKER, '--repo', root], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(run.status).toBe(1);
    expect(run.stdout).toBe('');
    expect(run.stderr).toContain('CORE_FORBIDDEN_IMPORT src/core/state/forbidden.ts:1:1');
    expect(run.stderr).toContain('[state-boundaries] failed: 1 violation(s)');
  }, 30_000);
});
