import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyzeAffectedTests, isDocumentationPath } from './select-ci-coverage';
import { discoverDocumentationConsumers } from './ci-documentation-consumers';

function git(args: string[], input?: string): Buffer {
  const result = spawnSync('git', args, { input, maxBuffer: 256 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr.toString() || `git ${args[0]} failed`);
  return result.stdout;
}
const text = (args: string[]) => git(args).toString().trim();

/** Content-addressed reads keep the replay fast without substituting today's tree for history. */
export function historicalSources(ref: string, cache = new Map<string, string>()): Map<string, string> {
  const records = git(['ls-tree', '-r', '-z', ref]).toString().split('\0').filter(Boolean).map(record => {
    const tab = record.indexOf('\t');
    const [, type, oid] = record.slice(0, tab).split(' ');
    return { path: record.slice(tab + 1), type, oid: oid! };
  });
  const needsSource = (path: string) => /\.[cm]?[jt]sx?$/.test(path) || path === 'scripts/check-ci.sh';
  const missing = [...new Set(records.filter(r => r.type === 'blob' && needsSource(r.path) && !cache.has(r.oid)).map(r => r.oid))];
  if (missing.length) {
    const output = git(['cat-file', '--batch'], missing.join('\n') + '\n');
    let offset = 0;
    for (const oid of missing) {
      const end = output.indexOf(10, offset);
      const header = output.subarray(offset, end).toString().split(' ');
      if (header[0] !== oid || header[1] !== 'blob' || !/^\d+$/.test(header[2] ?? '')) throw new Error(`Invalid historical blob: ${oid}`);
      const size = Number(header[2]);
      cache.set(oid, output.subarray(end + 1, end + 1 + size).toString());
      offset = end + size + 2;
    }
  }
  return new Map(records.filter(r => r.type === 'blob').map(r => [r.path, needsSource(r.path) ? cache.get(r.oid)! : '']));
}

export async function replayCoverage(count: number, ref = 'origin/main', baseline?: string) {
  if (!Number.isInteger(count) || count < 1) throw new Error('--commits requires a positive integer');
  const refSha = text(['rev-parse', '--verify', `${ref}^{commit}`]);
  const commits = text(['rev-list', '--first-parent', `-n${count}`, refSha]).split('\n').filter(Boolean);
  if (commits.length !== count) throw new Error(`History has ${commits.length} commits; ${count} required. Fetch more history.`);
  const cache = new Map<string, string>();
  const rows: Array<{ sha: string; code: boolean; selected: number; unknown: string[]; dropped: string[] }> = [];
  const directory = baseline ? mkdtempSync(join(tmpdir(), 'rh-ci-replay-')) : undefined;
  let oldSelector: ((...args: any[]) => string[] | Promise<string[]>) | undefined;
  const baselineSha = baseline ? text(['rev-parse', '--verify', `${baseline}^{commit}`]) : undefined;
  try {
    if (directory && baselineSha) {
      const file = join(directory, 'select-ci-coverage.ts');
      writeFileSync(file, git(['show', `${baselineSha}:scripts/select-ci-coverage.ts`]));
      oldSelector = (await import(pathToFileURL(file).href)).selectAffectedTests;
      if (typeof oldSelector !== 'function') throw new Error('Baseline has no selectAffectedTests export');
    }
    for (const sha of commits) {
      const parent = text(['rev-parse', '--verify', `${sha}^`]);
      const paths = git(['diff', '--name-only', '--no-renames', '-z', parent, sha]).toString().split('\0').filter(Boolean);
      const sources = historicalSources(sha, cache);
      const base = historicalSources(parent, cache);
      const previous = new Map(paths.filter(path => base.has(path)).map(path => [path, base.get(path)!]));
      const documentationConsumers = paths.some(isDocumentationPath)
        ? await discoverDocumentationConsumers('/__repo_harness_history__', undefined, sources) : [];
      const result = await analyzeAffectedTests(paths, sources, documentationConsumers, previous);
      const before = oldSelector ? await oldSelector(paths, sources, documentationConsumers, previous) : undefined;
      const selected = new Set(result.tests);
      const dropped = before?.filter(file => !selected.has(file)) ?? [];
      const code = paths.some(path => !isDocumentationPath(path));
      rows.push({ sha, code, selected: selected.size, unknown: result.uncovered, dropped });
      console.log(JSON.stringify({ sha, parent, code, paths, totalTests: [...sources.keys()].filter(p => /^tests\/.*\.test\.tsx?$/.test(p)).length,
        selected: selected.size, before: before?.length, unknown: result.uncovered, dailyOnly: result.dailyOnly, retired: result.retired,
        fullReasons: result.fullReasons, droppedTests: dropped }));
    }
    const sizes = rows.filter(r => r.code).map(r => r.selected).sort((a, b) => a - b);
    const percentile = (p: number) => sizes.length ? sizes[Math.floor((sizes.length - 1) * p)]! : null;
    const summary = { kind: 'replay-summary', refSha, baselineSha, graph: 'per-commit', documentationGraph: 'per-commit',
      commits: rows.length, codeCommits: sizes.length, median: percentile(.5), p25: percentile(.25), p75: percentile(.75),
      unknownCommits: rows.filter(r => r.unknown.length).length, unknownPaths: [...new Set(rows.flatMap(r => r.unknown))].sort(),
      droppedTestOccurrences: rows.reduce((n, r) => n + r.dropped.length, 0), droppedClassification: 'requires-review' };
    const blockers = [
      ...(count < 120 ? ['fewer-than-120-commits'] : []),
      ...(summary.median === null || summary.median > 200 ? ['code-median-exceeds-200-or-missing'] : []),
      ...(summary.unknownCommits ? ['unknown-coverage'] : []),
      ...(!baselineSha ? ['baseline-comparison-missing'] : []),
      ...(summary.droppedTestOccurrences ? ['removed-edge-review-incomplete'] : []),
    ];
    const report = { ...summary, acceptance: blockers.length ? 'blocked' : 'passed', blockers };
    console.log(JSON.stringify(report));
    return report;
  } finally { if (directory) rmSync(directory, { recursive: true, force: true }); }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const options = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i]!, value = args[i + 1];
    if (!['--commits', '--ref', '--baseline'].includes(name) || !value || value.startsWith('-') || options.has(name)) throw new Error('Usage: replay-ci-coverage.ts --commits <count> [--ref <ref>] [--baseline <ref>]');
    options.set(name, value);
  }
  const summary = await replayCoverage(Number(options.get('--commits')), options.get('--ref'), options.get('--baseline'));
  if (summary.acceptance !== 'passed') process.exitCode = 1;
}
