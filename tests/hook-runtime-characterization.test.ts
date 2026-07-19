import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import {
  cpSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { createHash } from 'crypto';
import { tmpdir } from 'os';
import { join, relative } from 'path';
import { pathToFileURL } from 'url';
import { spawnSync } from 'child_process';
import { ROUTES, type HookEvent, type Route, type RouteHost, type RouteId } from '../src/cli/hook/route-registry';

// Each of the 11 routes spawns a fresh fixture repo, its hook scripts (each
// of which may itself fork several bun/git subprocesses), and a bun -e
// wrapper subprocess; on multi-invocation parallel test load this can exceed
// the 5s bun default. See tests/hook-runtime.test.ts for the same rationale.
const CHARACTERIZATION_TIMEOUT_MS = 60000;
setDefaultTimeout(CHARACTERIZATION_TIMEOUT_MS);

const ROOT = join(import.meta.dir, '..');
const ASSETS_HOOKS_DIR = join(ROOT, 'assets/hooks');
const RUNTIME_MODULE = join(ROOT, 'src/cli/hook/runtime.ts');
const CLI = join(ROOT, 'src/cli/index.ts');
const HOOK_ENTRY = join(ROOT, 'src/cli/hook-entry.ts');
const FIXTURE_PATH = join(import.meta.dir, 'fixtures/loop-runtime/characterization.json');
const SPAWN_BUFFER_BYTES = 16 * 1024 * 1024;

// `runHook()` itself is invoked in-process inside a `bun -e` wrapper
// subprocess (via dynamic import), the same way a real host invokes the
// packaged CLI -- this is the only way to observe genuine host-visible
// fd 1/2 output: `RunHookResult` does not surface it, and `writeAllSync`'s
// writes go straight to the wrapper's own real stdout/stderr, which the
// *outer* spawnSync here captures. Resolving the real bun binary and
// invoking it by absolute path (not the bare `bun` name) keeps the PATH-stub
// directory below from also intercepting the wrapper's own launch -- only
// the nested child processes the route's scripts spawn via a bare `bun`/
// `git` name go through the stub.
const REAL_BUN = process.execPath;
const REAL_GIT = resolveRealBinary('git');

const FIXTURE_GIT_ENV = {
  GIT_AUTHOR_NAME: 'Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.com',
  GIT_COMMITTER_NAME: 'Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.com',
  // Pinned so the fixture's one commit hashes identically on every machine
  // and run (a git commit hash is a pure function of tree + these fields +
  // message), removing one whole class of nondeterminism up front rather
  // than normalizing hashes after the fact.
  GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z',
  GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z',
};

// `${event}.${routeId}` -> the fixed hook-input JSON and host this
// characterization exercises that route with. Every payload is drawn from
// an existing passing scenario in tests/hook-runtime.test.ts or
// tests/cli/hook.test.ts (see the notes file), not invented from scratch.
// The codex-only routes use host 'codex' (their only valid host per
// route-registry.ts `hosts`); every other route uses 'claude', matching
// tests/state/loop-semantics-characterization.test.ts's isolatedEnv default.
interface RouteFixtureConfig {
  readonly host: RouteHost;
  readonly input?: string;
}

function routeConfig(event: HookEvent, routeId: RouteId): RouteFixtureConfig {
  const key = `${event}.${routeId}`;
  switch (key) {
    case 'SessionStart.default':
      return { host: 'claude' };
    case 'PreToolUse.edit':
      return {
        host: 'claude',
        input: JSON.stringify({ tool_input: { file_path: 'src/example.ts' } }),
      };
    case 'PreToolUse.subagent':
      return {
        host: 'claude',
        input: JSON.stringify({
          hook_event_name: 'PreToolUse',
          tool_name: 'Task',
          tool_input: { description: 'Explore repo', prompt: 'Investigate the codebase and report findings.' },
        }),
      };
    case 'PostToolUse.edit':
      return {
        host: 'claude',
        input: JSON.stringify({ tool_input: { file_path: 'src/example.ts' } }),
      };
    case 'PostToolUse.bash':
      return {
        host: 'claude',
        input: JSON.stringify({ tool_input: { command: 'echo hello' }, tool_output: 'hello\n', exit_code: 0 }),
      };
    case 'PostToolUse.always':
      return {
        host: 'claude',
        input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Read' }),
      };
    case 'UserPromptSubmit.default':
      return {
        host: 'claude',
        input: JSON.stringify({ prompt: 'Please review this function for correctness.' }),
      };
    case 'UserPromptSubmit.delegation':
      return {
        host: 'codex',
        input: JSON.stringify({ session_id: 'characterization-session', prompt: 'implement the next sequential task' }),
      };
    case 'SubagentStart.context':
      return {
        host: 'codex',
        input: JSON.stringify({ hook_event_name: 'SubagentStart', session_id: 'characterization-session' }),
      };
    case 'SubagentStop.quality':
      return {
        host: 'codex',
        input: JSON.stringify({
          hook_event_name: 'SubagentStop',
          final_message:
            'Inspected src/cli/hook/runtime.ts and tests/cli/hook.test.ts. Evidence: ran bun test tests/cli/hook.test.ts. Risk: none identified.',
        }),
      };
    case 'Stop.default':
      return {
        host: 'claude',
        input: JSON.stringify({ hook_event_name: 'Stop', stop_hook_active: false }),
      };
    default:
      throw new Error(`no characterization fixture config for route ${key}`);
  }
}

function resolveRealBinary(name: string): string {
  const result = spawnSync('which', [name], { encoding: 'utf-8' });
  const resolved = result.stdout.trim();
  if (result.status !== 0 || !resolved) {
    throw new Error(`characterization harness could not resolve a real '${name}' binary via which`);
  }
  return resolved;
}

function run(cmd: string, args: readonly string[], cwd: string): void {
  const result = spawnSync(cmd, [...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, ...FIXTURE_GIT_ENV },
  });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed (${result.status}): ${result.stderr}`);
  }
}

function buildFixtureRepo(): { readonly root: string; cleanup(): void } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'loop-runtime-characterization-')));
  run('git', ['init', '-q', '-b', 'main'], root);
  run('git', ['config', 'user.email', 'fixture@example.com'], root);
  run('git', ['config', 'user.name', 'Fixture'], root);
  writeFileSync(join(root, 'README.md'), '# Loop runtime characterization fixture\n');
  run('git', ['add', '.'], root);
  run('git', ['commit', '-q', '-m', 'fixture: init'], root);

  const hooksDir = join(root, '.ai/hooks');
  mkdirSync(hooksDir, { recursive: true });
  for (const entry of readdirSync(ASSETS_HOOKS_DIR, { withFileTypes: true })) {
    const src = join(ASSETS_HOOKS_DIR, entry.name);
    const dest = join(hooksDir, entry.name);
    if (entry.isDirectory()) cpSync(src, dest, { recursive: true });
    else copyFileSync(src, dest);
  }
  const chmod = spawnSync('sh', ['-c', `find "${hooksDir}" -type f -name '*.sh' -exec chmod +x {} +`], { encoding: 'utf-8' });
  if (chmod.status !== 0) throw new Error(`chmod +x on fixture hooks failed: ${chmod.stderr}`);

  mkdirSync(join(root, '.ai/harness'), { recursive: true });
  writeFileSync(join(root, '.ai/harness/workflow-contract.json'), '{}\n');

  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

// Writes a PATH-instrumented passthrough stub: it records one classification
// word per invocation to `log` (never the raw argv, which can contain
// embedded newlines from inline `bun -e` script bodies and would corrupt a
// line-oriented log), then execs the real binary so the hook script's
// actual behavior -- and therefore this whole characterization -- is
// unaffected. `bun` is classified into 'cli' (invokes this repo's
// src/cli/index.ts or hook-entry.ts) vs 'generic' (everything else, e.g.
// inline `bun -e` JSON glue); `git` is not classified further.
function writeCountingStub(
  fakeBin: string,
  name: 'git' | 'bun',
  log: string,
  real: string,
): void {
  const classifyBun = [
    'is_cli=0',
    'for a in "$@"; do',
    '  case "$a" in',
    '    */cli/index.ts|*/cli/hook-entry.ts) is_cli=1 ;;',
    '  esac',
    'done',
    `if [[ "$is_cli" == "1" ]]; then printf 'cli\\n' >> "${log}"; else printf 'generic\\n' >> "${log}"; fi`,
  ].join('\n');
  const body = [
    '#!/bin/bash',
    name === 'bun' ? classifyBun : `printf 'git\\n' >> "${log}"`,
    `exec "${real}" "$@"`,
    '',
  ].join('\n');
  writeFileSync(join(fakeBin, name), body, { mode: 0o755 });
}

function wrapperScript(event: HookEvent, routeId: RouteId, resultFile: string): string {
  const moduleUrl = pathToFileURL(RUNTIME_MODULE).href;
  return [
    'const stdinText = await Bun.stdin.text();',
    `const { runHook } = await import(${JSON.stringify(moduleUrl)});`,
    `const result = runHook({ event: ${JSON.stringify(event)}, routeId: ${JSON.stringify(routeId)}, input: stdinText.length > 0 ? stdinText : undefined });`,
    `await Bun.write(${JSON.stringify(resultFile)}, JSON.stringify(result));`,
    'process.exit(result.exitCode);',
  ].join('\n');
}

interface Invocation {
  readonly stdout: string;
  readonly stderr: string;
  readonly processExitCode: number | null;
}

function invokeRoute(
  fixtureRoot: string,
  fakeBin: string,
  config: RouteFixtureConfig,
  event: HookEvent,
  routeId: RouteId,
  resultFile: string,
): Invocation {
  const script = wrapperScript(event, routeId, resultFile);
  const result = spawnSync(REAL_BUN, ['-e', script], {
    cwd: fixtureRoot,
    input: config.input ?? '',
    encoding: 'utf-8',
    maxBuffer: SPAWN_BUFFER_BYTES,
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
      HOOK_HOST: config.host,
      HOOK_SESSION_ID: 'characterization-session',
      CLAUDE_SESSION_ID: 'characterization-session',
      HOOK_RUN_ID: 'characterization-run',
      REPO_HARNESS_CLI: CLI,
      REPO_HARNESS_HOOK_CLI: HOOK_ENTRY,
    },
  });
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', processExitCode: result.status };
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

// Excludes `.git` -- read-only git plumbing (status/diff/rev-parse) can
// touch index/housekeeping internals without that being a harness durable
// write, matching tests/state/loop-semantics-characterization.test.ts's
// walkFiles convention.
function walkFiles(root: string): readonly string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (relative(root, path) === '.git') continue;
        visit(path);
      } else if (entry.isFile()) {
        files.push(path);
      }
    }
  };
  visit(root);
  return files.sort();
}

function repositorySnapshot(root: string): ReadonlyMap<string, string> {
  return new Map(walkFiles(root).map((path) => [relative(root, path), sha256(path)]));
}

function writtenPaths(before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>): readonly string[] {
  const changed: string[] = [];
  for (const path of new Set([...before.keys(), ...after.keys()])) {
    if (before.get(path) === after.get(path)) continue;
    changed.push(after.has(path) ? path : `deleted:${path}`);
  }
  return changed.sort();
}

const ISO_TIMESTAMP = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})/g;
const COMPACT_TIMESTAMP_PID = /\b\d{8}T\d{6}-\d+\b/g;
const DURATION_FIELD = /("(?:duration|elapsed)_ms")\s*:\s*\d+/g;
const PID_FIELD = /("pid")\s*:\s*\d+/gi;

// Normalizes exactly path/time/PID data, per the contract's explicit limit
// -- decision text, reasons, ordering, counts, and the write-set paths
// themselves are asserted verbatim. The fixture root substitution handles
// the one unavoidable nondeterministic path (a fresh mkdtemp dir every run);
// the rest cover wall-clock timestamps and elapsed/PID fields that a few
// scripts emit even with HOOK_SESSION_ID/HOOK_RUN_ID pinned above.
function normalize(text: string, fixtureRoot: string): string {
  return text
    .split(fixtureRoot).join('<FIXTURE_ROOT>')
    .replace(ISO_TIMESTAMP, '<TIMESTAMP>')
    .replace(COMPACT_TIMESTAMP_PID, '<TIMESTAMP_PID>')
    .replace(DURATION_FIELD, '$1:"<DURATION_MS>"')
    .replace(PID_FIELD, '$1:"<PID>"');
}

function captureRoute(route: Route): Record<string, unknown> {
  const config = routeConfig(route.event, route.routeId);
  const fixture = buildFixtureRepo();
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'loop-runtime-scratch-')));
  try {
    const fakeBin = join(scratch, 'fakebin');
    mkdirSync(fakeBin, { recursive: true });
    const log = join(scratch, 'stub-invocations.log');
    writeCountingStub(fakeBin, 'git', log, REAL_GIT);
    writeCountingStub(fakeBin, 'bun', log, REAL_BUN);
    const resultFile = join(scratch, 'result.json');

    const before = repositorySnapshot(fixture.root);
    const invocation = invokeRoute(fixture.root, fakeBin, config, route.event, route.routeId, resultFile);
    const after = repositorySnapshot(fixture.root);

    const result = JSON.parse(readFileSync(resultFile, 'utf-8')) as {
      exitCode: number;
      reason: string;
      scriptsRun: readonly string[];
      skippedScripts: readonly string[];
      failedScript?: string;
    };
    const logLines = existsSync(log)
      ? readFileSync(log, 'utf-8').trim().split('\n').filter((line) => line.length > 0)
      : [];

    // The wrapper always calls process.exit(result.exitCode) (see
    // wrapperScript above), so the subprocess's own OS exit code is
    // redundant with RunHookResult.exitCode by construction -- assert the
    // invariant instead of freezing a second copy of the same fact.
    expect(invocation.processExitCode).toBe(result.exitCode);

    return {
      event: route.event,
      route_id: route.routeId,
      host_exercised: config.host,
      scripts_run: result.scriptsRun,
      skipped_scripts: result.skippedScripts,
      failed_script: result.failedScript ?? null,
      exit_code: result.exitCode,
      reason: result.reason,
      child_invocations: {
        git: logLines.filter((line) => line === 'git').length,
        bun_cli: logLines.filter((line) => line === 'cli').length,
        bun_generic: logLines.filter((line) => line === 'generic').length,
      },
      stdout: normalize(invocation.stdout, fixture.root),
      stderr: normalize(invocation.stderr, fixture.root),
      write_set: writtenPaths(before, after),
    };
  } finally {
    fixture.cleanup();
    rmSync(scratch, { recursive: true, force: true });
  }
}

function captureMatrix(): Record<string, unknown> {
  return {
    schema: 'repo-harness-loop-runtime-characterization.v1',
    execution_base: '4f4666efd3810ed50dd1d5da17e44fd721d84689',
    routes: ROUTES.map(captureRoute),
  };
}

describe('HRD-01 loop runtime characterization', () => {
  test('freezes the current per-route baseline for all 11 public routes', () => {
    const actual = captureMatrix();
    const routes = actual.routes as ReadonlyArray<Record<string, unknown>>;

    expect(routes).toHaveLength(11);
    expect(new Set(routes.map((r) => `${r.event}.${r.route_id}`)).size).toBe(11);

    if (process.env.UPDATE_HOOK_RUNTIME_CHARACTERIZATION_GOLDEN === '1') {
      mkdirSync(join(FIXTURE_PATH, '..'), { recursive: true });
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(actual, null, 2)}\n`);
    }
    const expected = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));
    expect(actual).toEqual(expected);
  });
});
