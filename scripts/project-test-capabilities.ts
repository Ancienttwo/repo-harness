#!/usr/bin/env bun
/**
 * Test file -> source module -> architecture capability projection.
 *
 * Two inputs, no second authority:
 *  - the reverse import graph of scripts/select-ci-coverage.ts gives the source
 *    modules each test file depends on directly;
 *  - the archctx model gives the owning capability of each source module
 *    (`archctx resolve`) and the tests a capability declares in
 *    `extensions.verification`.
 *
 * The projection is generated on demand, never committed: it follows every
 * import edit, so a committed copy would go stale with each merge. CI generates
 * it on the commit it tests and uploads it next to the JUnit reports.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeAffectedTests } from './select-ci-coverage';
import { resolveArchcontextCapabilityPaths } from '../src/effects/architecture/archcontext-owners';

const MODEL_NODES = '.archcontext/model/nodes';
const TEST_FILE = /^tests\/.*\.test\.tsx?$/;
const SOURCE_MODULE = /\.([cm]?[jt]sx?|sh)$/;
const VERIFICATION_TEST = /tests\/[\w/.-]+\.test\.tsx?/g;
const SCHEMA = 'repo-harness.test-capability-projection/v1';

export type TestCapabilityLink = { id: string; via: Array<'import' | 'verification'> };
export type TestProjectionEntry = { file: string; sources: string[]; capabilities: TestCapabilityLink[] };
export type TestCapabilityProjection = {
  schemaVersion: typeof SCHEMA;
  tests: TestProjectionEntry[];
  /** Capabilities that declare tests in `extensions.verification`. */
  declared: Array<{ id: string; tests: string[] }>;
  /** Declared test files that no longer exist. */
  missing: Array<{ id: string; file: string }>;
};

export type ProjectionInput = {
  /** Repo-relative path to file content for every tracked file. */
  sources: ReadonlyMap<string, string>;
  /** Capability node id -> verification command strings. */
  verification: ReadonlyMap<string, readonly string[]>;
  /** Source module path -> owning capability node id; absent when unowned. */
  ownerOf(paths: readonly string[]): ReadonlyMap<string, string>;
};

const byteOrder = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);

/** Pure assembly step: the reverse graph and the model answers become the projection. */
export async function buildProjection(input: ProjectionInput): Promise<TestCapabilityProjection> {
  const { sources, verification } = input;
  const tests = [...sources.keys()].filter(file => TEST_FILE.test(file)).sort(byteOrder);
  const testSet = new Set(tests);
  const { graph } = await analyzeAffectedTests([], sources, []);

  // The graph maps dependency -> consumers. Invert it per test, keep source
  // code modules only: test helpers under tests/ and data files read by a test are not capability code.
  const sourcesOf = new Map<string, Set<string>>(tests.map(file => [file, new Set<string>()]));
  for (const [dependency, consumers] of graph.reverse) {
    if (dependency.startsWith('tests/') || !SOURCE_MODULE.test(dependency)) continue;
    for (const consumer of consumers) if (testSet.has(consumer)) sourcesOf.get(consumer)!.add(dependency);
  }

  const owners = input.ownerOf([...new Set([...sourcesOf.values()].flatMap(set => [...set]))].sort(byteOrder));

  const declared: TestCapabilityProjection['declared'] = [];
  const missing: TestCapabilityProjection['missing'] = [];
  const declaredBy = new Map<string, Set<string>>();
  for (const [id, commands] of [...verification].sort(([a], [b]) => byteOrder(a, b))) {
    const files = [...new Set(commands.flatMap(command => command.match(VERIFICATION_TEST) ?? []))].sort(byteOrder);
    if (!files.length) continue;
    const present = files.filter(file => sources.has(file));
    for (const file of files) if (!sources.has(file)) missing.push({ id, file });
    declared.push({ id, tests: present });
    for (const file of present) declaredBy.set(file, new Set([...(declaredBy.get(file) ?? []), id]));
  }

  const entries = tests.map((file): TestProjectionEntry => {
    const modules = [...sourcesOf.get(file)!].sort(byteOrder);
    const via = new Map<string, Set<'import' | 'verification'>>();
    for (const module of modules) {
      const id = owners.get(module);
      if (id) via.set(id, new Set([...(via.get(id) ?? []), 'import']));
    }
    for (const id of declaredBy.get(file) ?? []) via.set(id, new Set([...(via.get(id) ?? []), 'verification']));
    const capabilities = [...via].sort(([a], [b]) => byteOrder(a, b))
      .map(([id, ways]): TestCapabilityLink => ({ id, via: [...ways].sort(byteOrder) }));
    return { file, sources: modules, capabilities };
  });
  return { schemaVersion: SCHEMA, tests: entries, declared, missing };
}

/** One line per record keeps each change a one-line diff. */
export function serializeProjection(projection: TestCapabilityProjection): string {
  const lines = (records: readonly unknown[]) => records.map(record => `    ${JSON.stringify(record)}`).join(',\n');
  return [
    '{',
    `  "schemaVersion": ${JSON.stringify(projection.schemaVersion)},`,
    `  "tests": [\n${lines(projection.tests)}\n  ],`,
    `  "declared": [\n${lines(projection.declared)}\n  ],`,
    `  "missing": [${projection.missing.length ? `\n${lines(projection.missing)}\n  ` : ''}]`,
    '}',
    '',
  ].join('\n');
}

/** Capability node id -> verification strings, from the model node files. */
export function readModelVerification(root: string): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const directory = join(root, MODEL_NODES);
  for (const name of readdirSync(directory).filter(entry => entry.endsWith('.yaml')).sort(byteOrder)) {
    const node = Bun.YAML.parse(readFileSync(join(directory, name), 'utf8')) as any;
    const commands = node?.extensions?.verification;
    if (!Array.isArray(commands)) continue;
    if (typeof node.id !== 'string' || commands.some((command: unknown) => typeof command !== 'string')) {
      throw new Error(`Invalid extensions.verification in ${MODEL_NODES}/${name}`);
    }
    result.set(node.id, commands);
  }
  return result;
}

function trackedSources(root: string): Map<string, string> {
  const listed = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
  if (listed.status !== 0) throw new Error(listed.stderr || 'git ls-files failed');
  const sources = new Map<string, string>();
  for (const file of listed.stdout.split('\0').filter(Boolean)) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    // Directories and submodules are not source files; the selector skips them the same way.
    try { sources.set(file, readFileSync(path, 'utf8')); } catch { /* not a regular file */ }
  }
  return sources;
}

/** Ownership comes from `archctx resolve`, the model's own rule (ADR-0043). */
function archctxOwners(root: string, paths: readonly string[]): Map<string, string> {
  const resolution = resolveArchcontextCapabilityPaths(root, { get: id => ({ id }) }, paths);
  if (resolution.status !== 'valid') {
    throw new Error(`archctx resolve failed: ${resolution.diagnostics.map(entry => entry.message).join('; ') || resolution.status}`);
  }
  return new Map(resolution.matches.map(match => [match.filePath, match.capability.id]));
}

export async function generateProjection(root: string): Promise<string> {
  const projection = await buildProjection({
    sources: trackedSources(root),
    verification: readModelVerification(root),
    ownerOf: paths => archctxOwners(root, paths),
  });
  return serializeProjection(projection);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--out' || !args[1] || args[1].startsWith('-')) {
    process.stderr.write('Usage: bun scripts/project-test-capabilities.ts --out <file>\n');
    process.exit(2);
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const generated = await generateProjection(root);
  const target = resolve(args[1]);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, generated);
}
