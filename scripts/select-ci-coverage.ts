import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, posix } from 'node:path';

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
  return path === 'README.md' || path === 'docs/architecture/.projection-manifest.json'
    || path.startsWith('tasks/') || path.startsWith('plans/') || path.startsWith('.ai/harness/handoff/')
    || (path.startsWith('docs/') && path.endsWith('.md'));
}
export function diffBase(eventName: string, event: unknown): unknown {
  const payload = event as any;
  return eventName === 'pull_request' ? payload?.pull_request?.base?.sha : payload?.before;
}
export function selectCoverage(input: CoverageInput): CoverageSelection {
  const result = (mode: CoverageSelection['mode'], reason: string, paths: string[] = []): CoverageSelection => ({ mode, reason, paths });
  const { eventName, event, headSha, actualHead, diffRaw } = input;
  if (!validSha(headSha) || headSha !== actualHead) return result('invalid', 'checkout-mismatch');
  if (eventName === 'schedule' || eventName === 'workflow_dispatch') return result('daily', 'fixed-main-snapshot');
  if (!['pull_request', 'push'].includes(eventName)) return result('invalid', 'unknown-event');
  if (!validSha(diffBase(eventName, event))) return result('invalid', 'invalid-diff-endpoint');
  if (diffRaw === null || !diffRaw || !diffRaw.endsWith('\0')) return result('invalid', 'diff-unavailable-or-empty');
  const records = diffRaw.slice(0, -1).split('\0');
  if (records.length % 2) return result('invalid', 'invalid-diff');
  const paths: string[] = [];
  for (let index = 0; index < records.length; index += 2) {
    const metadata = /^:(\d{6}) (\d{6}) ([0-9a-f]{40}) ([0-9a-f]{40}) ([AMD])$/.exec(records[index]!);
    const path = records[index + 1]!;
    if (!metadata || path.split('/').some(part => !part || part === '.' || part === '..') || /[\r\n]/.test(path)) return result('invalid', 'invalid-diff');
    const [, oldMode, newMode, oldSha, newSha, status] = metadata;
    const modes = ['100644', '100755', '120000', '160000'];
    if (status === 'A' ? oldMode !== '000000' || oldSha !== '0'.repeat(40) || !modes.includes(newMode!)
      : status === 'D' ? newMode !== '000000' || newSha !== '0'.repeat(40) || !modes.includes(oldMode!)
      : !modes.includes(oldMode!) || !modes.includes(newMode!)) return result('invalid', 'invalid-diff');
    paths.push(path);
  }
  return result(eventName === 'push' ? 'report' : 'affected', 'complete-diff', paths);
}

/** Reverse source imports and literal runtime/file consumers, including old edges removed in this diff.
 * Directory and split-path literals deliberately widen coverage; unresolved changes fail closed.
 */
export function selectAffectedTests(paths: readonly string[], sources: ReadonlyMap<string, string>, previousSources: ReadonlyMap<string, string> = new Map()): string[] {
  const files = [...sources.keys()];
  const reverse = new Map<string, Set<string>>();
  const add = (dependency: string, consumer: string) => {
    if (dependency === consumer) return;
    const entries = reverse.get(dependency) ?? new Set<string>(); entries.add(consumer); reverse.set(dependency, entries);
  };
  const candidates = new Set([...files, ...paths, ...previousSources.keys()]);
  const references = new Map<string, Set<string>>();
  const reference = (key: string, dependency: string) => {
    const entries = references.get(key) ?? new Set<string>(); entries.add(dependency); references.set(key, entries);
  };
  for (const dependency of candidates) {
    reference(dependency, dependency);
    const parts = dependency.split('/');
    for (let i = 1; i < parts.length; i++) {
      reference(parts.slice(0, i).join('/'), dependency);
      if (parts.at(-1)!.includes('.')) reference(parts.slice(i).join('/'), dependency);
    }
  }
  for (const [file, source] of [...sources, ...previousSources]) {
    if (!/\.[cm]?[jt]sx?$/.test(file)) continue;
    // Bun parses imports without executing code. Fixture/template data is not a compiler project.
    const imports = /^(src|scripts|tests)\//.test(file) && !file.split('/').some(part => part === 'fixtures' || part === '__fixtures__')
      ? new Bun.Transpiler({ loader: file.endsWith('x') ? 'tsx' : 'ts', tsconfig: { compilerOptions: { jsx: 'react' } } }).scanImports(source.replace(/^#![^\n]*$/gm, '')).map(entry => entry.path) : [];
    // Literal file/directory consumers conservatively include comments and fixtures;
    // this widens tests but cannot hide an import edge or fabricate an external check result.
    const literals = [...source.matchAll(/['"`]([^'"`\r\n]+)['"`]/g)].map(match => match[1]!);
    for (const raw of [...imports, ...literals]) {
      const literal = raw.replaceAll('\\', '/');
      if (!literal || literal.includes('\n') || literal.startsWith('node:')) continue;
      const relativePath = posix.normalize(posix.join(dirname(file), literal));
      const normalized = literal.replace(/^\.\//, '').replace(/\/$/, '');
      for (const dependency of references.get(normalized) ?? []) add(dependency, file);
      for (const dependency of [relativePath, `${relativePath}.ts`, `${relativePath}.tsx`, `${relativePath}/index.ts`, `${relativePath}/index.tsx`]) {
        if (candidates.has(dependency)) add(dependency, file);
      }
    }
  }
  const tests = new Set<string>();
  const uncovered: string[] = [];
  for (const path of paths) {
    const seen = new Set([path]); const queue = [path]; let covered = false;
    for (let i = 0; i < queue.length; i++) {
      const consumer = queue[i]!;
      if (/^tests\/.*\.test\.tsx?$/.test(consumer) && sources.has(consumer)) { tests.add(consumer); covered = true; }
      for (const next of reverse.get(consumer) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
    // Research/archive prose has no executable behavior. Other unknown surfaces require a real consumer.
    if (!covered && !isDocumentationPath(path) && !path.startsWith('docs/images/')) uncovered.push(path);
  }
  if (uncovered.length) throw new Error(`Affected coverage is unknown for: ${uncovered.join(', ')}. Add the actual consumer regression; do not substitute a skipped/full-suite pass.`);
  return [...tests].sort();
}
function git(args: string[]): string {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args[0]} failed`);
  return result.stdout;
}
if (import.meta.main) {
  const eventName = process.env.GITHUB_EVENT_NAME ?? '';
  const headSha = process.env.GITHUB_SHA ?? '';
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH!, 'utf8'));
  const base = diffBase(eventName, event);
  const actualHead = git(['rev-parse', 'HEAD']).trim();
  const diffRaw = validSha(base) && validSha(headSha) && actualHead === headSha
    ? git(['diff', '--raw', '--no-abbrev', '--no-renames', '-z', base, headSha, '--']) : null;
  const selection = selectCoverage({ eventName, event, headSha, actualHead, diffRaw });
  if (selection.mode === 'invalid') throw new Error(selection.reason);
  if (selection.mode === 'daily' && process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('Daily validation requires the fixed main snapshot');
  if (selection.mode === 'affected') {
    const sources = new Map<string, string>();
    for (const file of git(['ls-files', '-z']).split('\0').filter(Boolean)) if (existsSync(file)) {
      try { sources.set(file, readFileSync(file, 'utf8')); } catch { /* directories/submodules are validated by their consumer */ }
    }
    const previousSources = new Map<string, string>();
    for (const file of selection.paths) {
      const old = spawnSync('git', ['show', `${base}:${file}`], { encoding: 'utf8' });
      if (old.status === 0) previousSources.set(file, old.stdout);
    }
    const tests = selectAffectedTests(selection.paths, sources, previousSources);
    writeFileSync('.ci-affected-tests.json', JSON.stringify(tests));
    console.log(`Selected ${tests.length} affected tests for ${selection.paths.length} changed paths`);
  }
  console.log(`mode=${selection.mode}\nreason=${selection.reason}\nhead=${headSha}\nbase=${base ?? headSha}`);
  appendFileSync(process.env.GITHUB_OUTPUT!, `mode=${selection.mode}\nsha=${headSha}\n`);
}
