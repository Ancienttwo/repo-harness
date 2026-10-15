import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, posix } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverPathReferences, sourceKey } from './ci-path-consumers';

export type CoverageInput = {
  eventName: string; event: unknown; headSha: string; actualHead: string; diffRaw: string | null;
};
export type CoverageSelection = { mode: 'affected' | 'daily' | 'report' | 'invalid'; reason: string; paths: string[] };
export function validSha(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value) && value !== '0'.repeat(40);
}
export function isDocumentationPath(path: string): boolean {
  if (path.split('/').some(part => !part || part === '.' || part === '..')) return false;
  if (path.startsWith('docs/reference-configs/')) return false;
  return path === 'README.md' || path === 'DEBUG.md' || path === 'docs/architecture/.projection-manifest.json'
    || (path.startsWith('examples/') && path.endsWith('.md'))
    || path.startsWith('tasks/') || path.startsWith('plans/') || path.startsWith('.ai/harness/handoff/')
    || (path.startsWith('docs/') && path.endsWith('.md'));
}
export function diffBase(eventName: string, event: unknown): unknown {
  const payload = event as any;
  return eventName === 'pull_request' ? payload?.pull_request?.base?.sha : payload?.before;
}
function validPath(path: string): boolean {
  return !path.split('/').some(part => !part || part === '.' || part === '..') && !/[\r\n]/.test(path);
}
export function selectCoverage(input: CoverageInput): CoverageSelection {
  const result = (mode: CoverageSelection['mode'], reason: string, paths: string[] = []): CoverageSelection => ({ mode, reason, paths });
  const { eventName, event, headSha, actualHead, diffRaw } = input;
  if (!validSha(headSha) || headSha !== actualHead) return result('invalid', 'checkout-mismatch');
  if (eventName === 'schedule' || eventName === 'workflow_dispatch') return result('daily', 'fixed-main-snapshot');
  if (!['pull_request', 'push', 'local'].includes(eventName)) return result('invalid', 'unknown-event');
  if (!validSha(diffBase(eventName, event))) return result('invalid', 'invalid-diff-endpoint');
  if (eventName === 'local' && diffRaw === '') return result('affected', 'complete-diff');
  if (diffRaw === null || !diffRaw || !diffRaw.endsWith('\0')) return result('invalid', 'diff-unavailable-or-empty');
  const records = diffRaw.slice(0, -1).split('\0');
  if (records.length % 2) return result('invalid', 'invalid-diff');
  const paths: string[] = [];
  for (let index = 0; index < records.length; index += 2) {
    const metadata = /^:(\d{6}) (\d{6}) ([0-9a-f]{40}) ([0-9a-f]{40}) ([AMD])$/.exec(records[index]!);
    const path = records[index + 1]!;
    if (!metadata || !validPath(path)) return result('invalid', 'invalid-diff');
    const [, oldMode, newMode, oldSha, newSha, status] = metadata;
    const modes = ['100644', '100755', '120000', '160000'];
    if (status === 'A' ? oldMode !== '000000' || oldSha !== '0'.repeat(40) || !modes.includes(newMode!)
      : status === 'D' ? newMode !== '000000' || newSha !== '0'.repeat(40) || !modes.includes(oldMode!)
      : !modes.includes(oldMode!) || !modes.includes(newMode!)) return result('invalid', 'invalid-diff');
    paths.push(path);
  }
  return result(eventName === 'push' ? 'report' : 'affected', 'complete-diff', paths);
}

/** Imports and exact paths propagate; directory content edges apply to direct changes only. */
export async function selectAffectedTests(paths: readonly string[], sources: ReadonlyMap<string, string>, documentationConsumers: readonly string[], previousSources: ReadonlyMap<string, string> = new Map()): Promise<string[]> {
  const result = await analyzeAffectedTests(paths, sources, documentationConsumers, previousSources);
  if (result.uncovered.length) throw new Error(`Affected coverage is unknown for: ${result.uncovered.join(', ')}. Add the actual consumer regression; do not substitute a skipped/full-suite pass.`);
  return result.tests;
}

/** Every CI test job sources this runner. */
const CI_TEST_RUNNER = 'scripts/lib/ci-run-tests.sh';

/** The bunfig test preloads run in every test process. Empty when bunfig.toml is absent or names none. */
export function configuredTestPreloads(sources: ReadonlyMap<string, string>): string[] {
  const preload = (Bun.TOML.parse(sources.get('bunfig.toml') ?? '') as any)?.test?.preload;
  if (preload === undefined) return [];
  if (!Array.isArray(preload) || preload.some((path: unknown) => typeof path !== 'string' || !validPath(path.replace(/^\.\//, '')))) throw new Error('Platform coverage requires test preloads');
  return preload.map((path: string) => path.replace(/^\.\//, ''));
}

export async function analyzeAffectedTests(paths: readonly string[], sources: ReadonlyMap<string, string>, documentationConsumers: readonly string[], previousSources: ReadonlyMap<string, string> = new Map()) {
  const files = [...sources.keys()];
  const allTests = files.filter(file => /^tests\/.*\.test\.tsx?$/.test(file)).sort();
  const globalInputs = platformImportClosure(configuredTestPreloads(sources), sources).add(CI_TEST_RUNNER);
  const fullReasons = paths.filter(path => ['package.json', 'bun.lock', 'bunfig.toml', 'tsconfig.json'].includes(path) || globalInputs.has(path));
  const reverse = new Map<string, Set<string>>();
  const data = new Map<string, Set<string>>();
  const add = (graph: Map<string, Set<string>>, dependency: string, consumer: string) => {
    if (dependency === consumer) return;
    const entries = graph.get(dependency) ?? new Set<string>(); entries.add(consumer); graph.set(dependency, entries);
  };
  const candidates = new Set([...files, ...paths, ...previousSources.keys()]);
  const references = new Map<string, Map<string, boolean>>();
  const reference = (key: string, dependency: string, directory: boolean) => {
    const entries = references.get(key) ?? new Map<string, boolean>(); entries.set(dependency, directory); references.set(key, entries);
  };
  for (const dependency of candidates) {
    reference(dependency, dependency, false);
    const parts = dependency.split('/');
    for (let i = 1; i < parts.length; i++) {
      reference(parts.slice(0, i).join('/'), dependency, true);
      if (parts.at(-1)!.includes('.')) reference(parts.slice(i).join('/'), dependency, false);
    }
  }
  const pathReferences = await discoverPathReferences([...sources, ...previousSources]);
  for (const [file, source] of [...sources, ...previousSources]) {
    if (!/\.[cm]?[jt]sx?$/.test(file)) continue;
    const imports = new Bun.Transpiler({ loader: file.endsWith('x') ? 'tsx' : 'ts', tsconfig: { compilerOptions: { jsx: 'react' } } }).scanImports(source.replace(/^#![^\n]*$/gm, '')).map(entry => entry.path);
    for (const raw of imports) {
      const relativePath = posix.normalize(posix.join(dirname(file), raw));
      for (const dependency of [relativePath, `${relativePath}.ts`, `${relativePath}.tsx`, `${relativePath}/index.ts`, `${relativePath}/index.tsx`]) {
        if (candidates.has(dependency)) add(reverse, dependency, file);
      }
    }
    for (const entry of pathReferences.get(sourceKey(file, source)) ?? []) {
      const wildcard = entry.path.indexOf('*');
      const literal = wildcard >= 0 ? entry.path.slice(0, wildcard).replace(/\/$/, '') : entry.path;
      if (!literal) continue;
      for (const [dependency, directory] of references.get(literal) ?? []) {
        if (directory && entry.operation === 'constructed') continue;
        add(directory && entry.operation !== 'execute' ? data : reverse, dependency, file);
      }
      const relativePath = posix.normalize(posix.join(dirname(file), literal));
      for (const dependency of [relativePath, `${relativePath}.ts`, `${relativePath}.tsx`, `${relativePath}/index.ts`, `${relativePath}/index.tsx`]) {
        if (candidates.has(dependency)) add(reverse, dependency, file);
      }
    }
  }
  const dailyInputs = discoverDailyInputs(sources);
  const tests = new Set<string>();
  const uncovered: string[] = [], dailyOnly: string[] = [], retired: string[] = [];
  for (const path of paths) {
    if (isDocumentationPath(path)) { for (const test of documentationConsumers) if (sources.has(test)) tests.add(test); continue; }
    if (fullReasons.includes(path)) continue;
    const seen = new Set([path]); const queue = [path]; let covered = false;
    for (const consumer of data.get(path) ?? []) if (!seen.has(consumer)) { seen.add(consumer); queue.push(consumer); }
    for (let i = 0; i < queue.length; i++) {
      const consumer = queue[i]!;
      if (/^tests\/.*\.test\.tsx?$/.test(consumer) && sources.has(consumer)) { tests.add(consumer); covered = true; }
      for (const next of reverse.get(consumer) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
    if (covered || path.startsWith('docs/images/')) continue;
    if (previousSources.has(path) && !sources.has(path) && [...seen].some(file => /^tests\/.*\.test\.tsx?$/.test(file) && previousSources.has(file)) && [...seen].every(file => !sources.has(file))) { retired.push(path); continue; }
    if (dailyInputs.has(path)) { dailyOnly.push(path); continue; }
    uncovered.push(path);
  }
  return { graph: { reverse, data }, tests: fullReasons.length ? allTests : [...tests].sort(), uncovered, dailyOnly, retired, fullReasons };
}

/** Explicit daily commands are evidence of deferred execution, never a claimed PR pass. */
export function discoverDailyInputs(sources: ReadonlyMap<string, string>): Set<string> {
  const script = sources.get('scripts/check-ci.sh') ?? '';
  const start = script.indexOf('if [[ "$lane" == all || "$lane" == functional ]]');
  if (start < 0) return new Set();
  const inputs = new Set<string>();
  for (const match of script.slice(start).matchAll(/(?:bash|bun)\s+(scripts\/[\w/.-]+\.(?:sh|ts))/g)) {
    if (sources.has(match[1]!)) inputs.add(match[1]!);
  }
  return inputs;
}
export type PlatformInputs = { native: ReadonlySet<string>; home: ReadonlySet<string> };
export function selectPlatformCoverage(paths: readonly string[], inputs: PlatformInputs): { native_oar: boolean; home_isolation: boolean } {
  const shared = paths.some(path => path.startsWith('.github/')
    || ['package.json', 'bun.lock', 'bunfig.toml', 'tsconfig.json', 'scripts/check-ci.sh'].includes(path)
    || path.startsWith('scripts/lib/') || /^scripts\/select-[^/]+\.ts$/.test(path));
  return {
    // The native job installs the Herdr version pinned in this policy file (install-pinned-herdr action).
    native_oar: shared || paths.some(path => path.endsWith('.sh') || path === '.ai/harness/policy.json' || inputs.native.has(path)),
    home_isolation: shared || paths.some(path => inputs.home.has(path)),
  };
}

/** Resolve only real local imports. A native or HOME root pulls in every repo-local module it imports. */
export function platformImportClosure(roots: readonly string[], sources: ReadonlyMap<string, string>): Set<string> {
  const seen = new Set(roots);
  const queue = [...roots];
  for (let index = 0; index < queue.length; index++) {
    const file = queue[index]!;
    const source = sources.get(file);
    if (source === undefined) throw new Error(`Platform coverage requires source: ${file}`);
    // Data imports such as JSON schemas are trigger inputs with no imports of their own.
    if (!/\.[cm]?[jt]sx?$/.test(file)) continue;
    const imports = new Bun.Transpiler({ loader: file.endsWith('x') ? 'tsx' : 'ts' }).scanImports(source.replace(/^#![^\n]*$/gm, ''));
    for (const entry of imports) {
      if (!entry.path.startsWith('.')) continue;
      const base = posix.normalize(posix.join(dirname(file), entry.path));
      const dependency = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find(path => sources.has(path));
      if (!dependency) throw new Error(`Unresolved platform import: ${file} -> ${entry.path}`);
      if (seen.has(dependency)) continue;
      seen.add(dependency); queue.push(dependency);
    }
  }
  return seen;
}

export function bundleInputPaths(metafile: unknown): string[] {
  const inputs = (metafile as any)?.inputs;
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs) || !Object.keys(inputs).length) throw new Error('OAR bundle inputs are missing');
  const paths = Object.keys(inputs).map(path => path.replace(/^\.\//, ''));
  if (paths.some(path => !validPath(path) || path.startsWith('/') || /^[A-Za-z]:/.test(path))) throw new Error('Invalid OAR bundle input path');
  return paths;
}

/** Workflow test commands and package build scripts own the native inventory. No second file list. */
export function discoverPlatformInputs(sources: ReadonlyMap<string, string>, root = process.cwd()): PlatformInputs {
  const workflow = Bun.YAML.parse(sources.get('.github/workflows/ci.yml') ?? '') as any;
  const testsFor = (job: string, name: string): string[] => {
    const steps = workflow?.jobs?.[job]?.steps?.filter((step: any) => step.name === name);
    if (steps?.length !== 1 || typeof steps[0].run !== 'string') throw new Error(`Platform coverage requires ${job}: ${name}`);
    const tests = [...new Set<string>(steps[0].run.match(/tests\/[\w/.-]+\.test\.tsx?/g) ?? [])];
    if (!tests.length) throw new Error(`Platform tests are missing: ${name}`);
    return tests;
  };
  const preloads = configuredTestPreloads(sources);
  if (!preloads.length) throw new Error('Platform coverage requires test preloads');
  const native = platformImportClosure([...testsFor('native-oar', 'Run native OAR acceptance tests'), ...preloads], sources);
  const home = platformImportClosure([...testsFor('home-isolation', 'Run the isolation tests'), ...preloads], sources);
  const directory = mkdtempSync(join(tmpdir(), 'rh-ci-platform-'));
  try {
    for (const name of ['build:oar-review-host', 'build:oar-coding-host']) {
      const metafile = join(directory, `${name.replaceAll(':', '-')}.json`);
      const build = spawnSync(process.execPath, ['run', name, `--metafile=${metafile}`, `--outfile=${join(directory, 'host.js')}`], { cwd: root, encoding: 'utf8' });
      if (build.status !== 0) throw new Error(`Platform bundle failed: ${name}\n${build.stdout}\n${build.stderr}`);
      for (const path of bundleInputPaths(JSON.parse(readFileSync(metafile, 'utf8')))) native.add(path);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
  return { native, home };
}

function git(args: string[]): string {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args[0]} failed`);
  return result.stdout;
}
if (import.meta.main) {
  const args = process.argv.slice(2);
  const local = args.length === 2 && args[0] === '--base' && !!args[1] && !args[1].startsWith('-');
  if (args.length && !local) throw new Error('Usage: select-ci-coverage.ts [--base <git-ref>]');
  const actualHead = git(['rev-parse', 'HEAD']).trim();
  const eventName = local ? 'local' : process.env.GITHUB_EVENT_NAME ?? '';
  const headSha = local ? actualHead : process.env.GITHUB_SHA ?? '';
  const event = local ? { before: git(['rev-parse', '--verify', `${args[1]}^{commit}`]).trim() }
    : JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH!, 'utf8'));
  const base = diffBase(eventName, event);
  const diffRaw = validSha(base) && validSha(headSha) && actualHead === headSha
    ? git(['diff', '--raw', '--no-abbrev', '--no-renames', '-z', base, ...(local ? [] : [headSha]), '--']) : null;
  const selection = selectCoverage({ eventName, event, headSha, actualHead, diffRaw });
  if (selection.mode === 'invalid') throw new Error(selection.reason);
  if (selection.mode === 'daily' && process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('Daily validation requires the fixed main snapshot');
  let platforms = { native_oar: selection.mode === 'daily', home_isolation: selection.mode === 'daily' };
  if (selection.mode === 'affected') {
    if (local) {
      const untracked = git(['ls-files', '--others', '--exclude-standard', '--exclude=.ci-affected-tests.json', '-z']).split('\0').filter(Boolean);
      if (untracked.some(path => !validPath(path))) throw new Error('invalid-diff');
      selection.paths = [...new Set([...selection.paths, ...untracked])];
    }
    const sources = new Map<string, string>();
    for (const file of git(['ls-files', ...(local ? ['--cached', '--others', '--exclude-standard', '--exclude=.ci-affected-tests.json'] : []), '-z']).split('\0').filter(Boolean)) if (existsSync(file)) {
      try { sources.set(file, readFileSync(file, 'utf8')); } catch { /* directories/submodules are validated by their consumer */ }
    }
    const previousSources = new Map<string, string>();
    for (const file of selection.paths) {
      const old = spawnSync('git', ['show', `${base}:${file}`], { encoding: 'utf8' });
      if (old.status === 0) previousSources.set(file, old.stdout);
    }
    const documentationConsumers = selection.paths.some(isDocumentationPath)
      ? await (await import('./ci-documentation-consumers')).discoverDocumentationConsumers(process.cwd()) : [];
    platforms = selectPlatformCoverage(selection.paths, discoverPlatformInputs(sources));
    const coverage = await analyzeAffectedTests(selection.paths, sources, documentationConsumers, previousSources);
    if (coverage.uncovered.length) throw new Error(`Affected coverage is unknown for: ${coverage.uncovered.join(', ')}`);
    for (const path of coverage.dailyOnly) console.log(`daily-only=${path}; not verified by this PR`);
    const tests = coverage.tests;
    writeFileSync('.ci-affected-tests.json', JSON.stringify(tests));
    console.log(`Selected ${tests.length} affected tests for ${selection.paths.length} changed paths`);
  }
  console.log(`mode=${selection.mode}\nreason=${selection.reason}\nhead=${headSha}\nbase=${base ?? headSha}\nnative_oar=${platforms.native_oar}\nhome_isolation=${platforms.home_isolation}`);
  if (!local) appendFileSync(process.env.GITHUB_OUTPUT!, `mode=${selection.mode}\nsha=${headSha}\nnative_oar=${platforms.native_oar}\nhome_isolation=${platforms.home_isolation}\n`);
}
