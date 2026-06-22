import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { performance } from 'perf_hooks';
import { getMcpPolicy } from '../src/cli/mcp/policy';
import {
  callReaderTool,
  createReaderToolContext,
  type ReaderToolContext,
} from '../src/cli/mcp/reader-tools';
import { WorkspaceManager } from '../src/cli/mcp/workspaces';
import type { GeneralRepoCodeGraphAdapter } from '../src/cli/mcp/codegraph-adapter';

interface BenchmarkOptions {
  entries: number[];
  pageSize: number;
  maxResults: number;
  keep: boolean;
  json: boolean;
}

const DEFAULT_ENTRIES = [10_000];
const PLAN_ENTRIES = [10_000, 100_000, 500_000];

function parseArgs(argv: string[]): BenchmarkOptions {
  const options: BenchmarkOptions = {
    entries: DEFAULT_ENTRIES,
    pageSize: 1000,
    maxResults: 50,
    keep: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--entries' && next) {
      options.entries = next === 'all'
        ? PLAN_ENTRIES
        : next.split(',').map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0);
      index += 1;
    } else if (arg === '--page-size' && next) {
      options.pageSize = Number(next);
      index += 1;
    } else if (arg === '--max-results' && next) {
      options.maxResults = Number(next);
      index += 1;
    } else if (arg === '--keep') {
      options.keep = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  if (options.entries.length === 0) {
    throw new Error('--entries must include at least one positive integer or "all"');
  }
  return options;
}

function printHelp(): void {
  console.log(`Usage: bun scripts/benchmark-general-repo-reader.ts [options]

Options:
  --entries <n[,n]|all>  File counts to generate. Default: 10000.
  --page-size <n>        repo_manifest/list_tree page size. Default: 1000.
  --max-results <n>      search_text max_results. Default: 50.
  --keep                 Keep generated fixture repos.
  --json                 Print JSON only.
`);
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

function generatedPath(index: number): string {
  return `src/${pad(index % 100, 3)}/file-${pad(index, 7)}.txt`;
}

function generateFixture(repoRoot: string, entries: number): void {
  mkdirSync(join(repoRoot, 'src'), { recursive: true });
  mkdirSync(join(repoRoot, 'ignored'), { recursive: true });
  writeFileSync(
    join(repoRoot, '.ignore'),
    [
      'ignored/**',
      '!ignored/reincluded.txt',
      '',
    ].join('\n'),
  );
  writeFileSync(join(repoRoot, '.dotfile'), 'dotfile remains visible\n');
  writeFileSync(join(repoRoot, 'unknown.extless'), 'unknown extension remains visible\n');
  writeFileSync(join(repoRoot, 'binary.bin'), Buffer.from([0, 1, 2, 3, 4, 5]));
  writeFileSync(join(repoRoot, 'ignored', 'hidden.txt'), 'ignored\n');
  writeFileSync(join(repoRoot, 'ignored', 'reincluded.txt'), 'reincluded\n');
  for (let dir = 0; dir < 100; dir += 1) {
    mkdirSync(join(repoRoot, 'src', pad(dir, 3)), { recursive: true });
  }
  for (let index = 0; index < entries; index += 1) {
    const needle = index % 1000 === 0 ? ' benchmark-needle' : '';
    writeFileSync(
      join(repoRoot, generatedPath(index)),
      `line ${index}${needle}\nsecond line ${entries - index}\n`,
    );
  }
}

async function jsonTool(ctx: ReaderToolContext, name: string, args: Record<string, unknown> = {}) {
  const result = await callReaderTool(ctx, name, args);
  return JSON.parse(result.content[0].text);
}

async function measure<T>(name: string, fn: () => Promise<T>): Promise<{ name: string; duration_ms: number; result: T }> {
  const start = performance.now();
  const result = await fn();
  return { name, duration_ms: Number((performance.now() - start).toFixed(2)), result };
}

function disabledCodeGraphAdapter(): GeneralRepoCodeGraphAdapter {
  return {
    discoverRepo() {
      return {
        available: false,
        integrated: false,
        source: 'benchmark-disabled',
        indexRevision: 'index_unavailable',
        latencyMs: 0,
        files: [],
        error: 'benchmark fixture intentionally isolates filesystem walker/cache behavior',
      };
    },
  };
}

async function runOne(entries: number, options: BenchmarkOptions) {
  const repoRoot = mkdtempSync(join(tmpdir(), `repo-harness-reader-bench-${entries}-`));
  const startedAt = new Date().toISOString();
  try {
    generateFixture(repoRoot, entries);
    const policy = getMcpPolicy('planner', { enableReader: true, allowedRoots: [repoRoot] });
    const workspaceManager = new WorkspaceManager({ allowedRoots: [repoRoot], policy });
    const ctx = createReaderToolContext(repoRoot, policy, workspaceManager, disabledCodeGraphAdapter());
    const roots = await jsonTool(ctx, 'list_allowed_roots');
    const repoId = roots.roots[0].repo_id;
    const firstPath = generatedPath(0);

    const coldManifest = await measure('cold_manifest_first_page', () => jsonTool(ctx, 'repo_manifest', {
      repo_id: repoId,
      page_size: options.pageSize,
    }));
    const warmManifest = await measure('warm_manifest_first_page', () => jsonTool(ctx, 'repo_manifest', {
      repo_id: repoId,
      page_size: options.pageSize,
    }));
    const listTree = await measure('list_tree_root_depth_1', () => jsonTool(ctx, 'list_tree', {
      repo_id: repoId,
      path: '.',
      depth: 1,
      page_size: options.pageSize,
      snapshot_id: warmManifest.result.snapshot_id,
    }));
    const readFile = await measure('read_file_first_chunk', () => jsonTool(ctx, 'read_file', {
      repo_id: repoId,
      path: firstPath,
      snapshot_id: warmManifest.result.snapshot_id,
    }));
    const warmSearch = await measure('warm_literal_search', () => jsonTool(ctx, 'search_text', {
      repo_id: repoId,
      query: 'benchmark-needle',
      mode: 'literal',
      max_results: options.maxResults,
      snapshot_id: warmManifest.result.snapshot_id,
    }));

    return {
      entries_requested: entries,
      repo_root: repoRoot,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      generated_first_path: firstPath,
      rss_bytes_after_measurements: process.memoryUsage().rss,
      measurements: [
        summarize(coldManifest),
        summarize(warmManifest),
        summarize(listTree),
        summarize(readFile),
        summarize(warmSearch),
      ],
      manifest: {
        snapshot_state: warmManifest.result.snapshot_state,
        complete: warmManifest.result.complete,
        counts: warmManifest.result.counts,
        next_cursor: warmManifest.result.next_cursor,
        cache: warmManifest.result.snapshot_cache,
      },
      search: {
        match_count: warmSearch.result.matches?.length ?? 0,
        truncated: warmSearch.result.truncated,
        next_cursor: warmSearch.result.next_cursor,
        cache: warmSearch.result.snapshot_cache,
      },
      read: {
        bytes_returned: readFile.result.bytes_returned,
        has_more: readFile.result.has_more,
        cache: readFile.result.snapshot_cache,
      },
    };
  } finally {
    if (!options.keep) rmSync(repoRoot, { recursive: true, force: true });
  }
}

function summarize(measurement: { name: string; duration_ms: number; result: Record<string, unknown> }) {
  return {
    name: measurement.name,
    duration_ms: measurement.duration_ms,
    snapshot_id: measurement.result.snapshot_id,
    snapshot_state: measurement.result.snapshot_state,
    partial: measurement.result.partial,
    next_cursor: measurement.result.next_cursor,
    cache_hit: (measurement.result.snapshot_cache as { hit?: boolean } | undefined)?.hit,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const results = [];
  for (const entries of options.entries) {
    results.push(await runOne(entries, options));
  }
  const output = {
    version: 1,
    benchmark: 'general-repo-reader',
    generated_at: new Date().toISOString(),
    options: {
      entries: options.entries,
      page_size: options.pageSize,
      max_results: options.maxResults,
    },
    results,
  };
  if (options.json) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    for (const result of results) {
      console.log(`entries=${result.entries_requested} rss=${result.rss_bytes_after_measurements}`);
      for (const measurement of result.measurements) {
        console.log(`  ${measurement.name}: ${measurement.duration_ms}ms cache_hit=${measurement.cache_hit}`);
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
