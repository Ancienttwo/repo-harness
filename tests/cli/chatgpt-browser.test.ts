import { describe, expect, test, setDefaultTimeout } from 'bun:test';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { dirname, join } from 'path';
import { runBrowserConsult, runBrowserFollowup } from '../../src/cli/chatgpt-browser/engine';
import { createCdpClient, waitForVerifiedAssistantText } from '../../src/cli/chatgpt-browser/native-provider';
import { DEFAULT_SESSION_ROOT, listBrowserSessions, writeBrowserSession } from '../../src/cli/chatgpt-browser/session-store';
import { assertChatGptMcpContract } from '../helpers/chatgpt-mcp-contract';

const ROOT = join(import.meta.dir, '../..');
const CLI = join(ROOT, 'src/cli/index.ts');

setDefaultTimeout(180000);

function runChatgpt(args: string[], cwd = ROOT, env: NodeJS.ProcessEnv = process.env) {
  return spawnSync('bun', [CLI, 'chatgpt', ...args], {
    cwd,
    encoding: 'utf-8',
    env,
  });
}

async function runBrowserOutputRace(repoRoot: string, relativePath: string): Promise<Array<{ ok: boolean; output?: string; error?: string }>> {
  const barrierRoot = join(repoRoot, `.chatgpt-browser-output-barrier-${Date.now()}-${process.pid}`);
  mkdirSync(barrierRoot);
  const releasePath = join(barrierRoot, 'release');
  const workerPath = join(import.meta.dir, '../fixtures/chatgpt-browser-write-output-worker.ts');
  const outputs = ['writer-a', 'writer-b'];
  const workers = outputs.map((output, index) => Bun.spawn({
    cmd: [
      process.execPath,
      workerPath,
      repoRoot,
      relativePath,
      output,
      join(barrierRoot, `ready-${index}`),
      releasePath,
    ],
    stdout: 'pipe',
    stderr: 'pipe',
  }));

  const deadline = Date.now() + 5_000;
  while ((!existsSync(join(barrierRoot, 'ready-0')) || !existsSync(join(barrierRoot, 'ready-1'))) && Date.now() < deadline) {
    await Bun.sleep(5);
  }
  expect(existsSync(join(barrierRoot, 'ready-0'))).toBe(true);
  expect(existsSync(join(barrierRoot, 'ready-1'))).toBe(true);
  writeFileSync(releasePath, 'go\n', { flag: 'wx' });

  const exits = await Promise.all(workers.map((worker) => worker.exited));
  expect(exits).toEqual([0, 0]);
  const records = await Promise.all(workers.map(async (worker) => {
    const [stdout, stderr] = await Promise.all([
      new Response(worker.stdout).text(),
      new Response(worker.stderr).text(),
    ]);
    expect(stderr).toBe('');
    return JSON.parse(stdout) as { ok: boolean; output?: string; error?: string };
  }));
  rmSync(barrierRoot, { recursive: true, force: true });
  return records;
}

function withRepo<T>(fn: (repoRoot: string) => T): T {
  const repoRoot = mkdtempSync(join(tmpdir(), 'repo-harness-chatgpt-browser-'));
  try {
    mkdirSync(join(repoRoot, 'plans/sprints'), { recursive: true });
    mkdirSync(join(repoRoot, 'docs'), { recursive: true });
    writeFileSync(join(repoRoot, 'plans/sprints/example.sprint.md'), '# Sprint\n\n- [ ] Task\n');
    writeFileSync(join(repoRoot, 'docs/example.md'), '# Docs\n');
    writeFileSync(join(repoRoot, '.env'), 'SECRET=value\n');
    return fn(repoRoot);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
}

async function withAsyncRepo<T>(fn: (repoRoot: string) => Promise<T>): Promise<T> {
  const repoRoot = mkdtempSync(join(tmpdir(), 'repo-harness-chatgpt-browser-'));
  try {
    mkdirSync(join(repoRoot, 'docs'), { recursive: true });
    writeFileSync(join(repoRoot, 'docs/example.md'), '# Docs\n');
    return await fn(repoRoot);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
}

function writeFakeGitleaks(dir: string, version = '8.30.0'): string {
  const path = join(dir, 'gitleaks');
  writeFileSync(path, [
    '#!/usr/bin/env bun',
    `const VERSION = ${JSON.stringify(version)};`,
    "if (process.argv.includes('version')) { console.log(VERSION); process.exit(0); }",
    "const required = ['--redact=100', '--ignore-gitleaks-allow', 'stdin'];",
    'if (required.some((flag) => !process.argv.includes(flag))) process.exit(3);',
    'if (process.env.GITLEAKS_CONFIG || process.env.GITLEAKS_CONFIG_TOML) process.exit(4);',
    'if (process.env.FAKE_GITLEAKS_REPO_ROOT && process.cwd() === process.env.FAKE_GITLEAKS_REPO_ROOT) process.exit(5);',
    'const input = await Bun.stdin.text();',
    'if (process.env.FAKE_GITLEAKS_MUTATE_PATH) await Bun.write(process.env.FAKE_GITLEAKS_MUTATE_PATH, process.env.FAKE_GITLEAKS_MUTATE_CONTENT || "");',
    "process.exit(input.includes('SYNTHETIC_DELEGATE_SECRET') ? 1 : 0);",
  ].join('\n') + '\n');
  chmodSync(path, 0o755);
  return path;
}

// Oracle browser transport fixtures. The bound-profile path probes the resolved
// binary for --copy-profile/--browser-chrome-profile before it runs, so any fake
// oracle used with a profile binding must answer --help/--debug-help.
const FAKE_ORACLE_HELP = 'Usage: oracle --engine browser --browser-archive never --write-output <p> --browser-follow-up <t> --followup <id> --browser-model-strategy current --browser-cookie-path <path> --copy-profile <dir> --browser-chrome-profile <name> --chatgpt-url <url> --heartbeat <seconds>';

function writeFakeOracle(path: string, opts: { help?: string; sessionLine?: string; body?: string[] } = {}): string {
  writeFileSync(path, [
    '#!/bin/sh',
    'case "$1" in',
    '  --version) printf "%s\\n" "0.14.1"; exit 0;;',
    `  --help|--debug-help) printf "%s\\n" "${opts.help ?? FAKE_ORACLE_HELP}"; exit 0;;`,
    'esac',
    ...(opts.body ?? [
      'ARGS="$*"',
      'OUT=""',
      'PREV=""',
      'for a in "$@"; do',
      '  if [ "$PREV" = "--write-output" ]; then OUT="$a"; fi',
      '  PREV="$a"',
      'done',
      ...(opts.sessionLine ? [`printf "%s\\n" "${opts.sessionLine}"`] : []),
      'if [ -n "$OUT" ]; then printf "%s\\n" "Oracle saw: $ARGS" > "$OUT"; fi',
    ]),
  ].join('\n'));
  chmodSync(path, 0o755);
  return path;
}

function bindChromeProfile(repoRoot: string, opts: { profileDirectory?: string } = {}): { userDataDir: string; profileDir: string } {
  const userDataDir = join(repoRoot, 'Chrome/User Data');
  const profileDir = join(userDataDir, opts.profileDirectory ?? 'Profile 1');
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(userDataDir, 'Local State'), '{}\n');
  writeFileSync(join(profileDir, 'Preferences'), '{}\n');
  const setup = runChatgpt([
    'browser-setup',
    '--repo',
    repoRoot,
    '--profile-dir',
    profileDir,
    '--browser-channel',
    'chrome',
    '--chatgpt-url',
    'https://chatgpt.com/',
  ]);
  expect(setup.status).toBe(0);
  return { userDataDir, profileDir };
}

describe('chatgpt browser command', () => {
  test('prints help for browser command group', () => {
    const root = runChatgpt(['--help']);
    expect(root.status).toBe(0);
    expect(root.stdout).toContain('browser-consult');
    expect(root.stdout).toContain('browser-followup');
    expect(root.stdout).toContain('browser-session');
    expect(root.stdout).toContain('browser-doctor');
    expect(root.stdout).toContain('install-skill');
    expect(root.stdout).toContain('uninstall-skill');
    expect(root.stdout).not.toContain('browser-bind');
    expect(root.stdout).toContain('browser-open');
    expect(root.stdout).toContain('browser-cleanup');

    const setup = runChatgpt(['browser-setup', '--help']);
    expect(setup.status).toBe(0);
    expect(setup.stdout).toContain('--profile-dir');
    expect(setup.stdout).toContain('--profile-directory');
    expect(setup.stdout).not.toContain('--open');

    const doctor = runChatgpt(['browser-doctor', '--help']);
    expect(doctor.status).toBe(0);
    expect(doctor.stdout).toContain('--validate-session');
    expect(doctor.stdout).toContain('--profile-directory');

    const consult = runChatgpt(['browser-consult', '--help']);
    expect(consult.status).toBe(0);
    expect(consult.stdout).toContain('ChatGPT Web');
    expect(consult.stdout).toContain('--dry-run');
    expect(consult.stdout).toContain('--profile-dir');
    expect(consult.stdout).toContain('--keep-browser');
    expect(consult.stdout).toContain('--allow-absolute-output');
    expect(consult.stdout).toContain('--heartbeat');
    expect(consult.stdout).toContain('--chatgpt-app');
    expect(consult.stdout).toContain('--secret-scan');
    expect(consult.stdout).toContain('--gitleaks-bin');
  }, 30_000);

  test('secret scan covers the exact prompt bundle and follow-ups fail closed before a new session', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-fake-gitleaks-'));
      try {
        const gitleaksPath = writeFakeGitleaks(binDir);
        const env = {
          ...process.env,
          REPO_HARNESS_GITLEAKS_BIN: gitleaksPath,
          GITLEAKS_CONFIG: join(repoRoot, '.gitleaks.toml'),
          GITLEAKS_CONFIG_TOML: '[allowlist]\n',
          FAKE_GITLEAKS_REPO_ROOT: repoRoot,
        };
        writeFileSync(join(repoRoot, '.gitleaks.toml'), '[allowlist]\n');
        const clean = runChatgpt([
          'browser-consult',
          '--repo',
          repoRoot,
          '--dry-run',
          '--secret-scan',
          '--prompt',
          'Review this clean bundle.',
          '--file',
          'docs/example.md',
        ], ROOT, env);
        expect(clean.status).toBe(0);
        const payload = JSON.parse(clean.stdout);
        expect(payload.dryRun.secretScan).toMatchObject({
          scanner: 'gitleaks',
          version: '8.30.0',
          source: 'REPO_HARNESS_GITLEAKS_BIN',
          status: 'passed',
        });
        const exactPrompt = readFileSync(payload.paths.prompt, 'utf-8');
        expect(payload.dryRun.secretScan.payloads).toEqual([{
          kind: 'prompt',
          index: 0,
          bytes: Buffer.byteLength(exactPrompt, 'utf-8'),
          sha256: createHash('sha256').update(exactPrompt, 'utf-8').digest('hex'),
        }]);
        const meta = JSON.parse(readFileSync(join(repoRoot, '.ai/harness/chatgpt/sessions', payload.sessionId, 'meta.json'), 'utf-8'));
        expect(meta.security.promptSecretScan).toEqual(payload.dryRun.secretScan);

        const sessionsRoot = join(repoRoot, '.ai/harness/chatgpt/sessions');
        const before = readdirSync(sessionsRoot).sort();
        const rejectedFollowup = runChatgpt([
          'browser-followup',
          '--repo',
          repoRoot,
          '--session',
          payload.sessionId,
          '--dry-run',
          '--prompt',
          'SYNTHETIC_DELEGATE_SECRET',
        ], ROOT, env);
        expect(rejectedFollowup.status).toBe(2);
        expect(rejectedFollowup.stderr).toContain('PROMPT_SECRET_SCAN_FAILED');
        expect(rejectedFollowup.stderr).not.toContain('SYNTHETIC_DELEGATE_SECRET');
        expect(readdirSync(sessionsRoot).sort()).toEqual(before);
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  }, 30_000);

  test('a scan-bound source session cannot disable inherited scanning programmatically', async () => {
    await withAsyncRepo(async (repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-fake-gitleaks-inheritance-'));
      try {
        const gitleaksBin = writeFakeGitleaks(binDir);
        const source = await runBrowserConsult({
          repoRoot,
          prompt: 'Review this clean bundle.',
          files: [{ path: 'docs/example.md' }],
          dryRun: true,
          requireSecretScan: true,
          gitleaksBin,
        });
        const before = readdirSync(join(repoRoot, '.ai/harness/chatgpt/sessions')).sort();
        await expect(runBrowserFollowup({
          repoRoot,
          sessionId: source.sessionId,
          prompt: 'SYNTHETIC_DELEGATE_SECRET',
          dryRun: true,
          requireSecretScan: false,
          gitleaksBin,
        })).rejects.toThrow('PROMPT_SECRET_SCAN_FAILED');
        expect(readdirSync(join(repoRoot, '.ai/harness/chatgpt/sessions')).sort()).toEqual(before);
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  });

  test('secret scan rejects findings, missing binaries, and incompatible versions before session creation', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-fake-gitleaks-errors-'));
      try {
        const scanner = writeFakeGitleaks(binDir);
        writeFileSync(join(repoRoot, 'docs/example.md'), 'SYNTHETIC_DELEGATE_SECRET # gitleaks:allow\n');
        const finding = runChatgpt([
          'browser-consult',
          '--repo',
          repoRoot,
          '--dry-run',
          '--secret-scan',
          '--gitleaks-bin',
          scanner,
          '--prompt',
          'Read the staged context.',
          '--file',
          'docs/example.md',
        ]);
        expect(finding.status).toBe(2);
        expect(finding.stderr).toContain('PROMPT_SECRET_SCAN_FAILED');
        expect(finding.stderr).not.toContain('SYNTHETIC_DELEGATE_SECRET');
        expect(existsSync(join(repoRoot, '.ai/harness/chatgpt/sessions'))).toBe(false);

        const unboundBinary = runChatgpt([
          'browser-consult',
          '--repo',
          repoRoot,
          '--dry-run',
          '--gitleaks-bin',
          scanner,
          '--prompt',
          'Clean prompt.',
        ]);
        expect(unboundBinary.status).toBe(2);
        expect(unboundBinary.stderr).toContain('--gitleaks-bin requires --secret-scan');
        expect(existsSync(join(repoRoot, '.ai/harness/chatgpt/sessions'))).toBe(false);

        const missing = runChatgpt([
          'browser-consult',
          '--repo',
          repoRoot,
          '--dry-run',
          '--secret-scan',
          '--gitleaks-bin',
          join(binDir, 'missing-gitleaks'),
          '--prompt',
          'Clean prompt.',
        ]);
        expect(missing.status).toBe(2);
        expect(missing.stderr).toContain('PROMPT_SECRET_SCAN_UNAVAILABLE');
        expect(existsSync(join(repoRoot, '.ai/harness/chatgpt/sessions'))).toBe(false);

        const incompatible = writeFakeGitleaks(binDir, '8.18.4');
        const old = runChatgpt([
          'browser-consult',
          '--repo',
          repoRoot,
          '--dry-run',
          '--secret-scan',
          '--gitleaks-bin',
          incompatible,
          '--prompt',
          'Clean prompt.',
        ]);
        expect(old.status).toBe(2);
        expect(old.stderr).toContain('version >= 8.19');
        expect(existsSync(join(repoRoot, '.ai/harness/chatgpt/sessions'))).toBe(false);
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  }, 30_000);

  test('scan-bound Oracle sends immutable captured file bytes instead of a post-scan source mutation', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-scan-bound-oracle-'));
      try {
        const sourcePath = join(repoRoot, 'docs/example.md');
        writeFileSync(sourcePath, 'ORIGINAL_SCANNED_CONTEXT\n');
        const gitleaksPath = writeFakeGitleaks(binDir);
        const oraclePath = join(binDir, 'oracle');
        writeFileSync(oraclePath, [
          '#!/bin/sh',
          'case "$1" in',
          '  --version) printf "%s\\n" "0.14.1"; exit 0;;',
          'esac',
          'OUT=""',
          'FILE=""',
          'PREV=""',
          'for a in "$@"; do',
          '  if [ "$PREV" = "--write-output" ]; then OUT="$a"; fi',
          '  if [ "$PREV" = "--file" ]; then FILE="$a"; fi',
          '  PREV="$a"',
          'done',
          'printf "%s\\n" "FILE_PATH=$FILE" > "$OUT"',
          '/bin/cat "$FILE" >> "$OUT"',
        ].join('\n') + '\n');
        chmodSync(oraclePath, 0o755);

        const result = runChatgpt([
          'browser-consult',
          '--repo',
          repoRoot,
          '--secret-scan',
          '--gitleaks-bin',
          gitleaksPath,
          '--oracle-bin',
          oraclePath,
          '--prompt',
          'Read the attached context.',
          '--file',
          'docs/example.md',
        ], ROOT, {
          ...process.env,
          FAKE_GITLEAKS_MUTATE_PATH: sourcePath,
          FAKE_GITLEAKS_MUTATE_CONTENT: 'SYNTHETIC_DELEGATE_SECRET\n',
        });
        expect(result.status).toBe(0);
        const payload = JSON.parse(result.stdout);
        expect(payload.status).toBe('completed');
        const output = readFileSync(payload.paths.output, 'utf-8');
        expect(output).toContain('repo-harness-oracle-egress-');
        expect(output).toContain('ORIGINAL_SCANNED_CONTEXT');
        expect(output).not.toContain('SYNTHETIC_DELEGATE_SECRET');
        expect(readFileSync(sourcePath, 'utf-8')).toBe('SYNTHETIC_DELEGATE_SECRET\n');
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  }, 30_000);

  test('explicit skill projection is canonical, idempotent, reversible, and refuses unowned destinations', () => {
    const testHome = mkdtempSync(join(tmpdir(), 'repo-harness-chatgpt-skill-home-'));
    try {
      const env = { ...process.env, HOME: testHome, REPO_HARNESS_SOURCE_ROOT: ROOT };
      const install = runChatgpt(['install-skill', '--target', 'both'], ROOT, env);
      expect(install.status).toBe(0);
      const canonical = realpathSync(join(ROOT, 'assets/skills/repo-harness-chatgpt'));
      const claudeSkill = join(testHome, '.claude/skills/repo-harness-chatgpt');
      const codexSkill = join(testHome, '.codex/skills/repo-harness-chatgpt');
      for (const destination of [claudeSkill, codexSkill]) {
        expect(lstatSync(destination).isSymbolicLink()).toBe(true);
        expect(realpathSync(destination)).toBe(canonical);
      }

      const reinstall = runChatgpt(['install-skill', '--target', 'both'], ROOT, env);
      expect(reinstall.status).toBe(0);
      expect(reinstall.stdout).toContain('[claude] already installed');
      expect(reinstall.stdout).toContain('[codex] already installed');

      const uninstall = runChatgpt(['uninstall-skill', '--target', 'both'], ROOT, env);
      expect(uninstall.status).toBe(0);
      expect(existsSync(claudeSkill)).toBe(false);
      expect(existsSync(codexSkill)).toBe(false);

      mkdirSync(codexSkill, { recursive: true });
      const refused = runChatgpt(['uninstall-skill', '--target', 'both'], ROOT, env);
      expect(refused.status).toBe(2);
      expect(refused.stderr).toContain('refusing unowned ChatGPT Skill destination');
      expect(existsSync(codexSkill)).toBe(true);
      expect(existsSync(claudeSkill)).toBe(false);
    } finally {
      rmSync(testHome, { recursive: true, force: true });
    }
  }, 30_000);

  test('dry-run consult writes a repo-local session with inline files', () => {
    withRepo((repoRoot) => {
      const result = runChatgpt([
        'browser-consult',
        '--repo',
        repoRoot,
        '--dry-run',
        '--title',
        'review sprint',
        '--prompt',
        'Review this sprint.',
        '--file',
        'plans/sprints/example.sprint.md',
        '--follow-up',
        'Challenge the recommendation.',
        '--model',
        'GPT-5.5 Pro',
        '--thinking',
        'heavy',
        '--chatgpt-app',
        'team-review-mcp',
      ]);
      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);
      expect(payload.status).toBe('dry_run');
      expect(payload.sessionId).toMatch(/^chgpt_\d{8}_\d{6}_review-sprint$/);
      expect(payload.dryRun.files[0].path).toBe('plans/sprints/example.sprint.md');

      const metaPath = join(repoRoot, '.ai/harness/chatgpt/sessions', payload.sessionId, 'meta.json');
      expect(existsSync(metaPath)).toBe(true);
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      expect(meta.engine).toBe('chatgpt-browser');
      expect(meta.provider).toBe('oracle');
      expect(meta.browser.profileDir).toBeUndefined();
      expect(meta.browser.chatgptApp).toBe('team-review-mcp');
      expect(payload.dryRun.command).toContain('--browser-app');
      expect(payload.dryRun.command).toContain('team-review-mcp');

      const read = runChatgpt(['browser-session', '--repo', repoRoot, payload.sessionId]);
      expect(read.status).toBe(0);
      expect(read.stdout).toContain('Dry run only');

      const listed = runChatgpt(['browser-list', '--repo', repoRoot, '--json']);
      expect(listed.status).toBe(0);
      expect(JSON.parse(listed.stdout).sessions[0].sessionId).toBe(payload.sessionId);

      const followup = runChatgpt([
        'browser-followup',
        '--repo',
        repoRoot,
        '--session',
        payload.sessionId,
        '--dry-run',
        '--prompt',
        'Turn that into a goal.',
      ]);
      expect(followup.status).toBe(0);
      const followupPayload = JSON.parse(followup.stdout);
      expect(followupPayload.sourceSessionId).toBe(payload.sessionId);
      const followupMeta = JSON.parse(readFileSync(join(repoRoot, '.ai/harness/chatgpt/sessions', followupPayload.sessionId, 'meta.json'), 'utf-8'));
      expect(followupMeta.sourceSessionId).toBe(payload.sessionId);
      expect(followupMeta.browser.chatgptApp).toBe('team-review-mcp');

      const cleanupPlan = runChatgpt(['browser-cleanup', '--repo', repoRoot, '--status', 'dry_run', '--limit', '1', '--json']);
      expect(cleanupPlan.status).toBe(0);
      expect(JSON.parse(cleanupPlan.stdout).dryRun).toBe(true);
    });
  }, 30_000);

  test('denies secret files before writing a session', () => {
    withRepo((repoRoot) => {
      const result = runChatgpt([
        'browser-consult',
        '--repo',
        repoRoot,
        '--dry-run',
        '--prompt',
        'Read this.',
        '--file',
        '.env',
      ]);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('path is denied by ChatGPT browser policy');
      expect(existsSync(join(repoRoot, '.ai/harness/chatgpt/sessions'))).toBe(false);
    });
  }, 30_000);

  test('denies allowed-path symlink escapes before writing a session', () => {
    withRepo((repoRoot) => {
      const outside = mkdtempSync(join(tmpdir(), 'repo-harness-chatgpt-browser-outside-'));
      try {
        writeFileSync(join(outside, 'secret.md'), '# outside\n');
        symlinkSync(join(outside, 'secret.md'), join(repoRoot, 'plans/sprints/linked.md'));
        const result = runChatgpt([
          'browser-consult',
          '--repo',
          repoRoot,
          '--dry-run',
          '--prompt',
          'Read this.',
          '--file',
          'plans/sprints/linked.md',
        ]);
        expect(result.status).toBe(2);
        expect(result.stderr).toContain('escapes repository root');
        expect(existsSync(join(repoRoot, '.ai/harness/chatgpt/sessions'))).toBe(false);
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    });
  }, 30_000);

  test('validates write-output path and overwrite policy before writing a session', () => {
    withRepo((repoRoot) => {
      const denied = runChatgpt([
        'browser-consult',
        '--repo',
        repoRoot,
        '--dry-run',
        '--prompt',
        'Reply OK.',
        '--write-output',
        '.env',
      ]);
      expect(denied.status).toBe(2);
      expect(denied.stderr).toContain('path is denied by ChatGPT browser policy');
      expect(readFileSync(join(repoRoot, '.env'), 'utf-8')).toBe('SECRET=value\n');
      expect(existsSync(join(repoRoot, '.ai/harness/chatgpt/sessions'))).toBe(false);

      const absolute = runChatgpt([
        'browser-consult',
        '--repo',
        repoRoot,
        '--dry-run',
        '--prompt',
        'Reply OK.',
        '--write-output',
        join(tmpdir(), 'repo-harness-chatgpt-browser-output.md'),
      ]);
      expect(absolute.status).toBe(2);
      expect(absolute.stderr).toContain('absolute write output paths require --allow-absolute-output');

      mkdirSync(join(repoRoot, 'tasks/reviews'), { recursive: true });
      writeFileSync(join(repoRoot, 'tasks/reviews/existing.md'), 'old\n');
      const noOverwrite = runChatgpt([
        'browser-consult',
        '--repo',
        repoRoot,
        '--dry-run',
        '--prompt',
        'Reply OK.',
        '--write-output',
        'tasks/reviews/existing.md',
      ]);
      expect(noOverwrite.status).toBe(2);
      expect(noOverwrite.stderr).toContain('write output already exists');
      expect(readFileSync(join(repoRoot, 'tasks/reviews/existing.md'), 'utf-8')).toBe('old\n');
    });
  }, 30_000);

  test('rejects imported artifact basename collisions before creating a session', () => {
    withRepo((repoRoot) => {
      const sourceRoot = mkdtempSync(join(tmpdir(), 'repo-harness-chatgpt-browser-artifacts-'));
      try {
        const sourceA = join(sourceRoot, 'reports');
        const sourceB = join(sourceRoot, 'reviews');
        mkdirSync(sourceA, { recursive: true });
        mkdirSync(sourceB, { recursive: true });
        const sourcePathA = join(sourceA, 'result.md');
        const sourcePathB = join(sourceB, 'result.md');
        writeFileSync(sourcePathA, 'report evidence\n');
        writeFileSync(sourcePathB, 'review evidence\n');

        expect(() => writeBrowserSession({
          input: {
            repoRoot,
            title: 'artifact collision',
            prompt: 'Review imported evidence.',
            dryRun: true,
          },
          provider: 'oracle',
          status: 'dry_run',
          bundle: {
            prompt: 'Review imported evidence.',
            rendered: 'Review imported evidence.\n',
            files: [],
            followups: [],
            totalChars: 'Review imported evidence.'.length,
          },
          output: 'Dry run output',
          artifacts: [
            { sourcePath: sourcePathA, fileName: 'reports/result.md', size: Buffer.byteLength('report evidence\n') },
            { sourcePath: sourcePathB, fileName: 'reviews/result.md', size: Buffer.byteLength('review evidence\n') },
          ],
        })).toThrow('duplicate imported artifact basename "result.md"');

        expect(existsSync(join(repoRoot, DEFAULT_SESSION_ROOT))).toBe(false);
      } finally {
        rmSync(sourceRoot, { recursive: true, force: true });
      }
    });
  }, 30_000);

  test('lists session output and transcript paths from the configured session root', () => {
    withRepo((repoRoot) => {
      const absoluteRoot = mkdtempSync(join(tmpdir(), 'repo-harness-chatgpt-browser-custom-root-'));
      try {
        const cases: Array<{ customRoot?: string; expectedRoot: string }> = [
          { expectedRoot: DEFAULT_SESSION_ROOT },
          { customRoot: '.cache/chatgpt-sessions', expectedRoot: '.cache/chatgpt-sessions' },
          { customRoot: absoluteRoot, expectedRoot: absoluteRoot },
        ];

        for (const [index, current] of cases.entries()) {
          const output = `output for root ${index}`;
          const result = writeBrowserSession({
            input: {
              repoRoot,
              title: `custom root ${index}`,
              prompt: 'Review this session.',
              dryRun: true,
              sessionRoot: current.customRoot,
            },
            provider: 'oracle',
            status: 'dry_run',
            bundle: {
              prompt: 'Review this session.',
              rendered: 'Review this session.\n',
              files: [],
              followups: [],
              totalChars: 'Review this session.'.length,
            },
            output,
          });
          const summary = listBrowserSessions(repoRoot, current.customRoot).find((session) => session.sessionId === result.sessionId);
          expect(summary).toBeDefined();
          expect(summary?.outputPath).toBe(join(current.expectedRoot, result.sessionId, 'output.md'));
          expect(summary?.transcriptPath).toBe(join(current.expectedRoot, result.sessionId, 'transcript.md'));

          const outputPath = current.customRoot === absoluteRoot
            ? summary!.outputPath
            : join(repoRoot, summary!.outputPath);
          const transcriptPath = current.customRoot === absoluteRoot
            ? summary!.transcriptPath
            : join(repoRoot, summary!.transcriptPath);
          expect(existsSync(outputPath)).toBe(true);
          expect(existsSync(transcriptPath)).toBe(true);
          expect(readFileSync(outputPath, 'utf-8')).toBe(`${output}\n`);
          expect(readFileSync(transcriptPath, 'utf-8')).toContain(output);
        }
      } finally {
        rmSync(absoluteRoot, { recursive: true, force: true });
      }
    });
  }, 30_000);

  test('allows exactly one concurrent no-overwrite publisher to claim an output path', async () => {
    await withAsyncRepo(async (repoRoot) => {
      for (let round = 0; round < 3; round += 1) {
        const outputPath = `tasks/reviews/concurrent-${round}.md`;
        const records = await runBrowserOutputRace(repoRoot, outputPath);
        const successes = records.filter((record) => record.ok);
        const failures = records.filter((record) => !record.ok);
        expect(successes).toHaveLength(1);
        expect(failures).toHaveLength(1);
        expect(failures[0].error).toContain(`write output already exists: ${outputPath}`);
        expect(readFileSync(join(repoRoot, outputPath), 'utf-8')).toBe(`${successes[0].output}\n`);
        expect(listBrowserSessions(repoRoot)).toHaveLength(round + 1);
      }
    });
  }, 30_000);

  test('native provider readiness and dry-run are wired without opening a browser', () => {
    withRepo((repoRoot) => {
      const doctor = runChatgpt(['browser-doctor', '--repo', repoRoot, '--provider', 'native', '--json']);
      expect(doctor.status).toBe(0);
      const readiness = JSON.parse(doctor.stdout);
      expect(readiness.provider).toBe('native');
      expect(readiness.status).toBe('deprecated');
      expect(readiness.code).toBe('NATIVE_PROVIDER_DEPRECATED');
      expect(readiness.native.deprecated).toBe(true);
      expect(readiness.posture).toEqual({ oracle: 'default', native: 'deprecated' });
      expect(typeof readiness.native.installed).toBe('boolean');
      expect(readiness.native.driver).toBe('chrome-cdp');
      expect(readiness.native.defaultChannel).toBe('chrome');
      expect(readiness.native.productSession.status).toBe('not_configured');

      const result = runChatgpt([
        'browser-consult',
        '--repo',
        repoRoot,
        '--provider',
        'native',
        '--dry-run',
        '--prompt',
        'Reply exactly OK',
      ]);
      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);
      const meta = JSON.parse(readFileSync(join(repoRoot, '.ai/harness/chatgpt/sessions', payload.sessionId, 'meta.json'), 'utf-8'));
      expect(meta.provider).toBe('native');
      expect(meta.status).toBe('dry_run');
      expect(meta.browser.profileDir).toBeUndefined();

      const appPreselectDryRun = runChatgpt([
        'browser-consult',
        '--repo',
        repoRoot,
        '--provider',
        'native',
        '--dry-run',
        '--prompt',
        'Reply exactly OK',
        '--chatgpt-app',
        'team-review-mcp',
      ]);
      expect(appPreselectDryRun.status).toBe(0);
      const appPreselectPayload = JSON.parse(appPreselectDryRun.stdout);
      expect(appPreselectPayload.status).toBe('failed');
      expect(appPreselectPayload.error.code).toBe('CHATGPT_APP_PRESELECT_PROVIDER_UNSUPPORTED');

      const unsupported = runChatgpt([
        'browser-consult',
        '--repo',
        repoRoot,
        '--provider',
        'native',
        '--prompt',
        'Reply exactly OK',
        '--model',
        'GPT-5.5 Pro',
      ]);
      expect(unsupported.status).toBe(0);
      const unsupportedPayload = JSON.parse(unsupported.stdout);
      expect(unsupportedPayload.status).toBe('failed');
      expect(unsupportedPayload.error.code).toBe('NATIVE_MODEL_SELECTION_UNSUPPORTED');

      const unbound = runChatgpt([
        'browser-consult',
        '--repo',
        repoRoot,
        '--provider',
        'native',
        '--prompt',
        'Reply exactly OK',
      ]);
      expect(unbound.status).toBe(0);
      const unboundPayload = JSON.parse(unbound.stdout);
      expect(unboundPayload.status).toBe('failed');
      expect(unboundPayload.error.code).toBe('NATIVE_PROFILE_NOT_BOUND');
    });
  }, 30_000);

  test('rejects removed bridge provider and browser-bind command surfaces', () => {
    withRepo((repoRoot) => {
      const doctor = runChatgpt(['browser-doctor', '--repo', repoRoot, '--provider', 'bridge']);
      expect(doctor.status).toBe(2);
      expect(doctor.stderr).toContain('invalid --provider "bridge" (expected: oracle, native)');

      const consult = runChatgpt(['browser-consult', '--repo', repoRoot, '--provider', 'bridge', '--prompt', 'Reply OK']);
      expect(consult.status).toBe(2);
      expect(consult.stderr).toContain('invalid --provider "bridge" (expected: oracle, native)');

      const bind = runChatgpt(['browser-bind', '--repo', repoRoot]);
      expect(bind.status).not.toBe(0);
      expect(bind.stderr).toContain("unknown command 'browser-bind'");
    });
  }, 30_000);

  test('browser setup binds a user-selected ChatGPT profile and native dry-run uses it', () => {
    withRepo((repoRoot) => {
      const userDataDir = join(repoRoot, 'Chrome/User Data');
      const profileDir = join(userDataDir, 'Profile 1');
      mkdirSync(profileDir, { recursive: true });
      writeFileSync(join(userDataDir, 'Local State'), '{}\n');
      writeFileSync(join(profileDir, 'Preferences'), '{}\n');
      const setup = runChatgpt([
        'browser-setup',
        '--repo',
        repoRoot,
        '--profile-dir',
        profileDir,
        '--browser-channel',
        'chrome',
        '--chatgpt-url',
        'https://chatgpt.com/',
      ]);
      expect(setup.status).toBe(0);
      expect(setup.stdout).toContain('ChatGPT profile binding');
      expect(setup.stdout).not.toContain('browser-bind');
      expect(setup.stdout).toContain('browser-doctor --provider native --validate-session');

      const configPath = join(repoRoot, '.repo-harness/chatgpt-browser.local.json');
      expect(existsSync(configPath)).toBe(true);
      const binding = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(binding.product).toBe('chatgpt');
      expect(binding.profileDir).toBe(userDataDir);
      expect(binding.profileDirectory).toBe('Profile 1');
      expect(binding.selectedProfilePath).toBe(profileDir);
      expect(binding.browserChannel).toBe('chrome');
      expect(binding.chatgptUrl).toBe('https://chatgpt.com/');
      expect(binding.bridgeToken).toBeUndefined();
      const retiredPageKeys = ['bind' + 'PagePath', 'bind' + 'PageUrl'];
      expect(Object.keys(binding)).not.toEqual(expect.arrayContaining(retiredPageKeys));

      const doctor = runChatgpt(['browser-doctor', '--repo', repoRoot, '--provider', 'native', '--json']);
      expect(doctor.status).toBe(0);
      const readiness = JSON.parse(doctor.stdout);
      expect(readiness.native.productSession.status).toBe('bound');
      expect(readiness.native.productSession.profileDir).toBe(userDataDir);
      expect(readiness.native.productSession.profileDirectory).toBe('Profile 1');
      expect(readiness.native.productSession.selectedProfilePath).toBe(profileDir);
      expect(Object.keys(readiness.native.productSession)).not.toEqual(expect.arrayContaining(retiredPageKeys));
      expect(readiness.next).toContain('The native CDP provider is deprecated; use --provider oracle. Native remains only for short-term diagnostics.');
      if (readiness.native.installed) {
        expect(readiness.next).toContain('repo-harness chatgpt browser-doctor --provider native --validate-session');
      } else {
        expect(readiness.next).toContain('Install Google Chrome before native provider execution.');
      }

      const result = runChatgpt([
        'browser-consult',
        '--repo',
        repoRoot,
        '--provider',
        'native',
        '--dry-run',
        '--prompt',
        'Reply exactly OK',
      ]);
      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);
      const meta = JSON.parse(readFileSync(join(repoRoot, '.ai/harness/chatgpt/sessions', payload.sessionId, 'meta.json'), 'utf-8'));
      expect(meta.provider).toBe('native');
      expect(meta.browser.profileDir).toBe(userDataDir);
      expect(meta.browser.profileDirectory).toBe('Profile 1');
      expect(meta.browser.selectedProfilePath).toBe(profileDir);
      expect(meta.browser.channel).toBe('chrome');
    });
  }, 30_000);

  test('native provider blocks the default Chrome profile before CDP launch', () => {
    if (process.platform !== 'darwin') {
      expect(process.platform).not.toBe('darwin');
      return;
    }
    withRepo((repoRoot) => {
      const defaultChromeDir = join(homedir(), 'Library/Application Support/Google/Chrome');
      const doctor = runChatgpt([
        'browser-doctor',
        '--repo',
        repoRoot,
        '--provider',
        'native',
        '--profile-dir',
        defaultChromeDir,
        '--profile-directory',
        'Default',
        '--validate-session',
        '--json',
      ]);
      expect(doctor.status).toBe(0);
      const readiness = JSON.parse(doctor.stdout);
      expect(readiness.status).toBe('deprecated');
      expect(readiness.native.productSession.status).toBe('blocked_default_profile');
      expect(readiness.native.productSession.blockedByDefaultProfile).toBe(true);
      expect(readiness.native.productSession.validation).toBeUndefined();
      expect(readiness.browser.opensBrowser).toBe(false);

      const result = runChatgpt([
        'browser-consult',
        '--repo',
        repoRoot,
        '--provider',
        'native',
        '--profile-dir',
        defaultChromeDir,
        '--profile-directory',
        'Default',
        '--prompt',
        'Reply exactly OK',
      ]);
      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);
      expect(payload.status).toBe('failed');
      expect(payload.error.code).toBe('NATIVE_DEFAULT_PROFILE_CDP_BLOCKED');
      expect(payload.error.recovery).toContain('Chrome 136+ requires a non-standard --user-data-dir');
      expect(readFileSync(payload.paths.output, 'utf-8')).toContain('Chrome 136+ requires a non-standard --user-data-dir');
    });
  }, 30_000);

  test('native CDP starts Chrome on an atomically assigned port', () => {
    const source = readFileSync(join(ROOT, 'src/cli/chatgpt-browser/native-provider.ts'), 'utf-8');
    expect(source).toContain("'--remote-debugging-port=0'");
    expect(source).toContain('DevToolsActivePort');
    expect(source).not.toContain('getFreePort');
  });

  test('native CDP rejects every pending command after a remote socket close', async () => {
    const originalWebSocket = globalThis.WebSocket;
    class FakeWebSocket {
      static latest: FakeWebSocket | undefined;
      onopen: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;

      constructor(_url: string) {
        FakeWebSocket.latest = this;
        queueMicrotask(() => this.onopen?.());
      }

      send(_payload: string): void {}

      close(): void {
        this.onclose?.();
      }

      closeFromRemote(): void {
        this.onclose?.();
      }

      failFromRemote(): void {
        this.onerror?.();
      }
    }
    (globalThis as { WebSocket: typeof WebSocket }).WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    try {
      const client = await createCdpClient('ws://fake-cdp.test');
      const first = client.send('Runtime.evaluate');
      const second = client.send('Page.enable');
      const pendingFailures = Promise.all([
        first.then(() => 'resolved', (error) => error.message),
        second.then(() => 'resolved', (error) => error.message),
      ]);
      const socket = FakeWebSocket.latest;
      expect(socket).toBeDefined();

      socket!.closeFromRemote();

      expect(await pendingFailures).toEqual(['Chrome CDP websocket closed', 'Chrome CDP websocket closed']);
      await expect(client.send('Runtime.evaluate')).rejects.toThrow('Chrome CDP websocket closed');
      client.close();

      const errorClient = await createCdpClient('ws://fake-cdp.test');
      const pendingAfterError = errorClient.send('Runtime.evaluate');
      const errorFailure = pendingAfterError.then(() => 'resolved', (error) => error.message);
      FakeWebSocket.latest!.failFromRemote();
      expect(await errorFailure).toBe('Chrome CDP websocket closed');
      await expect(errorClient.send('Runtime.evaluate')).rejects.toThrow('Chrome CDP websocket closed');
    } finally {
      (globalThis as { WebSocket: typeof WebSocket }).WebSocket = originalWebSocket;
    }
  });

  test('native capture waits through a five-second streaming plateau for the terminal signal', async () => {
    const samples = [
      ...Array.from({ length: 12 }, () => ({ text: 'chunk A', streaming: true })),
      { text: 'chunk A\nchunk B', streaming: true },
      { text: 'chunk A\nchunk B', streaming: false },
    ];
    const client = {
      async send(method: string): Promise<unknown> {
        expect(method).toBe('Runtime.evaluate');
        return { result: { value: samples.shift() } };
      },
      close(): void {},
    };

    const capture = await waitForVerifiedAssistantText(client, 'page-session', 1, 10_000);

    expect(capture).toEqual({ text: 'chunk A\nchunk B', completed: true });
  }, 15_000);

  test('native capture accepts a new assistant message already in an explicit terminal state', async () => {
    const client = {
      async send(method: string): Promise<unknown> {
        expect(method).toBe('Runtime.evaluate');
        return { result: { value: { text: 'instant final', streaming: false } } };
      },
      close(): void {},
    };

    const capture = await waitForVerifiedAssistantText(client, 'page-session', 1, 600);

    expect(capture).toEqual({ text: 'instant final', completed: true });
  });

  test('oracle rejects unsupported versions uniformly before consultation side effects', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-oracle-version-policy-'));
      const withoutConfiguredOracle = { ...process.env };
      delete withoutConfiguredOracle.REPO_HARNESS_ORACLE_BIN;
      const writeOracle = (path: string, version: string) => {
        writeFileSync(path, [
          '#!/bin/sh',
          'case "$1" in',
          `  --version) printf "%s\\n" "${version}"; exit 0;;`,
          '  --help|--debug-help) printf "%s\\n" "Usage: oracle --engine browser --browser-archive never --write-output <p> --browser-follow-up <t> --followup <id> --browser-model-strategy current --browser-cookie-path <path> --copy-profile <dir> --browser-chrome-profile <name> --chatgpt-url <url> --heartbeat <seconds>"; exit 0;;',
          'esac',
          'if [ -n "$FAKE_ORACLE_EXECUTED" ]; then printf "%s\\n" "ran" > "$FAKE_ORACLE_EXECUTED"; fi',
        ].join('\n'));
        chmodSync(path, 0o755);
      };
      try {
        const explicitOld = join(binDir, 'oracle-old');
        const envExact = join(binDir, 'oracle-env');
        const pathExact = join(binDir, 'oracle');
        writeOracle(explicitOld, '0.14.0');
        writeOracle(envExact, '0.14.1');
        writeOracle(pathExact, '0.14.1');

        const explicitDoctor = runChatgpt(['browser-doctor', '--repo', repoRoot, '--provider', 'oracle', '--oracle-bin', explicitOld, '--json'], ROOT, withoutConfiguredOracle);
        const explicitReadiness = JSON.parse(explicitDoctor.stdout);
        expect(explicitReadiness).toMatchObject({
          status: 'action_required',
          code: 'ORACLE_VERSION_UNSUPPORTED',
          oracle: { resolvedFrom: '--oracle-bin', version: '0.14.0', requiredVersion: '0.14.1', versionCompatible: false },
        });
        expect(explicitReadiness.oracle.error.message).toContain('detected 0.14.0');
        expect(explicitReadiness.oracle.error.message).toContain('exactly 0.14.1');

        const executed = join(binDir, 'unexpected-execution');
        const rejectedRun = runChatgpt([
          'browser-consult',
          '--repo',
          repoRoot,
          '--prompt',
          'Do not submit this.',
          '--oracle-bin',
          explicitOld,
        ], ROOT, { ...withoutConfiguredOracle, FAKE_ORACLE_EXECUTED: executed });
        const rejectedPayload = JSON.parse(rejectedRun.stdout);
        expect(rejectedPayload).toMatchObject({ status: 'failed', error: { code: 'ORACLE_VERSION_UNSUPPORTED' } });
        expect(existsSync(executed)).toBe(false);
        expect(existsSync(join(repoRoot, '.ai/harness/chatgpt/oracle-home'))).toBe(false);

        const envDoctor = runChatgpt(['browser-doctor', '--repo', repoRoot, '--provider', 'oracle', '--json'], ROOT, {
          ...withoutConfiguredOracle,
          REPO_HARNESS_ORACLE_BIN: envExact,
        });
        expect(JSON.parse(envDoctor.stdout)).toMatchObject({
          status: 'ready',
          oracle: { resolvedFrom: 'REPO_HARNESS_ORACLE_BIN', version: '0.14.1', requiredVersion: '0.14.1', versionCompatible: true },
        });

        const repoLocalDir = join(repoRoot, 'node_modules/.bin');
        mkdirSync(repoLocalDir, { recursive: true });
        writeOracle(join(repoLocalDir, 'oracle'), '0.14.2');
        const repoLocalDoctor = runChatgpt(['browser-doctor', '--repo', repoRoot, '--provider', 'oracle', '--json'], ROOT, withoutConfiguredOracle);
        expect(JSON.parse(repoLocalDoctor.stdout)).toMatchObject({
          status: 'action_required',
          code: 'ORACLE_VERSION_UNSUPPORTED',
          oracle: { resolvedFrom: 'node_modules/.bin', version: '0.14.2', requiredVersion: '0.14.1', versionCompatible: false },
        });

        rmSync(repoLocalDir, { recursive: true, force: true });
        const pathDoctor = runChatgpt(['browser-doctor', '--repo', repoRoot, '--provider', 'oracle', '--json'], ROOT, {
          ...withoutConfiguredOracle,
          PATH: `${binDir}:${withoutConfiguredOracle.PATH ?? ''}`,
        });
        expect(JSON.parse(pathDoctor.stdout)).toMatchObject({
          status: 'ready',
          oracle: { resolvedFrom: 'PATH', version: '0.14.1', requiredVersion: '0.14.1', versionCompatible: true },
        });
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  }, 30_000);

  test('oracle timeout kills its POSIX process group and cleans staged egress', async () => {
    if (process.platform === 'win32') return;
    await withAsyncRepo(async (repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-oracle-process-tree-'));
      try {
        const oraclePath = join(binDir, 'oracle');
        const childPidPath = join(binDir, 'descendant.pid');
        const argsPath = join(binDir, 'args');
        const gitleaksPath = writeFakeGitleaks(binDir);
        writeFileSync(oraclePath, [
          '#!/bin/sh',
          'case "$1" in',
          '  --version) printf "%s\\n" "0.14.1"; exit 0;;',
          'esac',
          'printf "%s\\n" "$@" > "$FAKE_ORACLE_ARGS_PATH"',
          '(',
          '  trap "" TERM',
          '  while :; do sleep 1; done',
          ') &',
          'printf "%s\\n" "$!" > "$FAKE_ORACLE_DESCENDANT_PID_PATH"',
          'while :; do sleep 1; done',
        ].join('\n'));
        chmodSync(oraclePath, 0o755);

        const startedAt = Date.now();
        const result = runChatgpt([
          'browser-consult',
          '--repo',
          repoRoot,
          '--secret-scan',
          '--gitleaks-bin',
          gitleaksPath,
          '--oracle-bin',
          oraclePath,
          '--timeout-ms',
          '100',
          '--prompt',
          'Stop this Oracle process tree.',
          '--file',
          'docs/example.md',
        ], ROOT, {
          ...process.env,
          FAKE_ORACLE_ARGS_PATH: argsPath,
          FAKE_ORACLE_DESCENDANT_PID_PATH: childPidPath,
        });
        expect(Date.now() - startedAt).toBeLessThan(8_000);
        const payload = JSON.parse(result.stdout);
        expect(payload).toMatchObject({ status: 'failed', error: { code: 'ORACLE_EXEC_FAILED' } });
        expect(payload.error.message).toContain('timed out after 100ms');

        const args = readFileSync(argsPath, 'utf-8').trimEnd().split('\n');
        const stagedFile = args[args.indexOf('--file') + 1];
        expect(stagedFile).toContain('repo-harness-oracle-egress-');
        expect(existsSync(stagedFile)).toBe(false);
        expect(existsSync(dirname(dirname(stagedFile)))).toBe(false);

        await Bun.sleep(50);
        const descendantPid = Number.parseInt(readFileSync(childPidPath, 'utf-8'), 10);
        expect(() => process.kill(descendantPid, 0)).toThrow();
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  }, 15_000);

  test('oracle provider reads the --write-output answer file and treats stdout as logs', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-fake-oracle-bin-'));
      try {
        const oraclePath = join(binDir, 'oracle');
        // The fake echoes its args to stdout (logs) and writes the answer to the
        // managed --write-output path (authority). conversationUrl/sessionId come
        // from the stdout logs.
        writeFileSync(
          oraclePath,
          [
            '#!/bin/sh',
            'case "$1" in',
            '  --version) printf "%s\\n" "0.14.1"; exit 0;;',
            'esac',
            'ARGS="$*"',
            'OUT=""',
            'PREV=""',
            'for a in "$@"; do',
            '  if [ "$PREV" = "--write-output" ]; then OUT="$a"; fi',
            '  PREV="$a"',
            'done',
            'printf "%s\\n" "Oracle saw: $ARGS"',
            'printf "%s\\n" "Session ID: oracle_fake_123"',
            'printf "%s\\n" "https://chatgpt.com/c/fake-conversation"',
            'if [ -n "$OUT" ]; then',
            '  printf "%s\\n" "Final answer: Oracle saw: $ARGS" > "$OUT"',
            '  printf "%s\\n" "PWD: $PWD" >> "$OUT"',
            '  printf "%s\\n" "ORACLE_HOME_DIR: ${ORACLE_HOME_DIR:-}" >> "$OUT"',
            '  printf "%s\\n" "ORACLE_ENGINE: ${ORACLE_ENGINE:-}" >> "$OUT"',
            '  printf "%s\\n" "ORACLE_REMOTE_HOST: ${ORACLE_REMOTE_HOST:-}" >> "$OUT"',
            'fi',
          ].join('\n'),
        );
        chmodSync(oraclePath, 0o755);
        mkdirSync(join(repoRoot, '.oracle'), { recursive: true });
        writeFileSync(
          join(repoRoot, '.oracle/config.json'),
          '{"promptSuffix":"DO NOT INHERIT","browser":{"manualLogin":true,"modelStrategy":"ignore"}}\n',
        );
        const result = runChatgpt([
          'browser-consult',
          '--repo',
          repoRoot,
          '--prompt',
          'Review this.',
          '--file',
          'docs/example.md',
          '--model',
          'GPT-5.5 Pro',
          '--oracle-bin',
          oraclePath,
        ], ROOT, {
          ...process.env,
          ORACLE_ENGINE: 'api',
          ORACLE_REMOTE_HOST: '127.0.0.1:9473',
        });
        expect(result.status).toBe(0);
        expect(result.stderr).toContain('Oracle saw:');
        expect(result.stderr).toContain('--heartbeat 59');
        const payload = JSON.parse(result.stdout);
        expect(payload.status).toBe('completed');
        const output = readFileSync(payload.paths.output, 'utf-8');
        expect(output).toContain('Final answer: Oracle saw: --engine browser');
        expect(output).toContain('--heartbeat 59');
        expect(output).toContain('--browser-archive never');
        expect(output).toContain('--browser-model-strategy select');
        expect(output).toContain(`--file ${join(repoRoot, 'docs/example.md')}`);
        expect(output).not.toContain('--browser-manual-login');
        expect(output).not.toContain('DO NOT INHERIT');
        expect(output).not.toContain(`PWD: ${repoRoot}`);
        expect(output).toContain(`ORACLE_HOME_DIR: ${join(repoRoot, '.ai/harness/chatgpt/oracle-home')}`);
        expect(output).toContain('ORACLE_ENGINE:');
        expect(output).toContain('ORACLE_REMOTE_HOST:');
        const meta = JSON.parse(readFileSync(join(repoRoot, '.ai/harness/chatgpt/sessions', payload.sessionId, 'meta.json'), 'utf-8'));
        expect(meta.browser.conversationUrl).toBe('https://chatgpt.com/c/fake-conversation');
        expect(meta.providerSessionId).toBe('oracle_fake_123');
        expect(meta.oracle.binary).toBe(oraclePath);
        expect(meta.oracle.captureStatus).toBe('completed');
        expect(meta.output.artifacts).toEqual([]);

        const opened = runChatgpt(['browser-open', '--repo', repoRoot, payload.sessionId]);
        expect(opened.status).toBe(0);
        expect(JSON.parse(opened.stdout).url).toBe('https://chatgpt.com/c/fake-conversation');
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  }, 30_000);

  test('oracle provider copies the bound Chrome profile as the only transport', () => {
    withRepo((repoRoot) => {
      const { userDataDir } = bindChromeProfile(repoRoot);

      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-fake-oracle-profile-'));
      try {
        const oraclePath = writeFakeOracle(join(binDir, 'oracle'), { sessionLine: 'Session ID: oracle_profile_123' });
        const result = runChatgpt([
          'browser-consult',
          '--repo',
          repoRoot,
          '--prompt',
          'Review this.',
          '--oracle-bin',
          oraclePath,
        ]);
        expect(result.status).toBe(0);
        const payload = JSON.parse(result.stdout);
        expect(payload.status).toBe('completed');
        const output = readFileSync(payload.paths.output, 'utf-8');
        expect(output).toContain('--browser-model-strategy current');
        expect(output).toContain(`--copy-profile ${userDataDir}`);
        expect(output).toContain('--browser-chrome-profile Profile 1');
        expect(output).not.toContain('--browser-cookie-path');
        expect(output).toContain('--chatgpt-url https://chatgpt.com/');
        const meta = JSON.parse(readFileSync(join(repoRoot, '.ai/harness/chatgpt/sessions', payload.sessionId, 'meta.json'), 'utf-8'));
        expect(meta.browser.profileDir).toBe(userDataDir);
        expect(meta.browser.profileDirectory).toBe('Profile 1');
        expect(meta.browser.selectedProfilePath).toBe(join(userDataDir, 'Profile 1'));
        expect(meta.browser.transport).toBe('copy_profile');
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  }, 30_000);

  test('oracle provider fails closed when the resolved binary cannot copy a Chrome profile', () => {
    withRepo((repoRoot) => {
      bindChromeProfile(repoRoot);

      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-fake-oracle-no-copy-profile-'));
      try {
        const oraclePath = writeFakeOracle(join(binDir, 'oracle'), {
          help: 'Usage: oracle --engine browser --browser-archive never --write-output <p> --browser-cookie-path <path> --heartbeat <seconds>',
          body: ['printf "%s\\n" "unexpected oracle execution" >&2', 'exit 99'],
        });
        const result = runChatgpt([
          'browser-consult',
          '--repo',
          repoRoot,
          '--prompt',
          'Review this.',
          '--oracle-bin',
          oraclePath,
        ]);
        expect(result.status).toBe(0);
        const payload = JSON.parse(result.stdout);
        expect(payload.status).toBe('failed');
        expect(payload.error.code).toBe('ORACLE_COPY_PROFILE_UNSUPPORTED');
        const output = readFileSync(payload.paths.output, 'utf-8');
        expect(output).toContain('--copy-profile');
        expect(output).toContain('--browser-chrome-profile');
        expect(output).not.toContain('unexpected oracle execution');
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  }, 30_000);

  test('oracle provider fails closed when the bound Chrome user data directory has no Local State', () => {
    withRepo((repoRoot) => {
      const { userDataDir } = bindChromeProfile(repoRoot);
      rmSync(join(userDataDir, 'Local State'));

      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-fake-oracle-no-local-state-'));
      try {
        const oraclePath = writeFakeOracle(join(binDir, 'oracle'), {
          body: ['printf "%s\\n" "unexpected oracle execution" >&2', 'exit 99'],
        });
        const result = runChatgpt([
          'browser-consult',
          '--repo',
          repoRoot,
          '--prompt',
          'Review this.',
          '--oracle-bin',
          oraclePath,
        ]);
        expect(result.status).toBe(0);
        const payload = JSON.parse(result.stdout);
        expect(payload.status).toBe('failed');
        expect(payload.error.code).toBe('ORACLE_PROFILE_NOT_FOUND');
        expect(payload.error.recovery).toContain('browser-setup');
        const output = readFileSync(payload.paths.output, 'utf-8');
        expect(output).toContain('Local State');
        expect(output).not.toContain('unexpected oracle execution');
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  }, 30_000);

  test('oracle provider fails closed when the binding names no Chrome profile directory', () => {
    withRepo((repoRoot) => {
      // A user data directory bound without a profile subdirectory would leave
      // profile selection to Oracle's Local State last_used, which is not
      // deterministic; repo-harness refuses instead of guessing.
      const userDataDir = join(repoRoot, 'Chrome/User Data');
      mkdirSync(userDataDir, { recursive: true });
      writeFileSync(join(userDataDir, 'Local State'), '{}\n');
      const setup = runChatgpt([
        'browser-setup',
        '--repo',
        repoRoot,
        '--profile-dir',
        userDataDir,
        '--browser-channel',
        'chrome',
      ]);
      expect(setup.status).toBe(0);
      const binding = JSON.parse(readFileSync(join(repoRoot, '.repo-harness/chatgpt-browser.local.json'), 'utf-8'));
      expect(binding.profileDirectory).toBeUndefined();

      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-fake-oracle-no-profile-directory-'));
      try {
        const oraclePath = writeFakeOracle(join(binDir, 'oracle'), {
          body: ['printf "%s\\n" "unexpected oracle execution" >&2', 'exit 99'],
        });
        const result = runChatgpt([
          'browser-consult',
          '--repo',
          repoRoot,
          '--prompt',
          'Review this.',
          '--oracle-bin',
          oraclePath,
        ]);
        expect(result.status).toBe(0);
        const payload = JSON.parse(result.stdout);
        expect(payload.status).toBe('failed');
        expect(payload.error.code).toBe('ORACLE_PROFILE_NOT_FOUND');
        expect(payload.error.recovery).toContain('--profile-directory');
        const output = readFileSync(payload.paths.output, 'utf-8');
        expect(output).toContain('names no Chrome profile directory');
        expect(output).not.toContain('unexpected oracle execution');
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  }, 30_000);

  test('oracle provider maps a running same-prompt session to a reattach failure', () => {
    withRepo((repoRoot) => {
      bindChromeProfile(repoRoot);

      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-fake-oracle-session-running-'));
      try {
        const oraclePath = writeFakeOracle(join(binDir, 'oracle'), {
          body: [
            'for a in "$@"; do',
            '  if [ "$a" = "--dry-run" ]; then exit 0; fi',
            'done',
            'printf "%s\\n" "A session with the same prompt is already running" >&2',
            'exit 1',
          ],
        });
        const result = runChatgpt([
          'browser-consult',
          '--repo',
          repoRoot,
          '--prompt',
          'Review this.',
          '--oracle-bin',
          oraclePath,
        ]);
        expect(result.status).toBe(0);
        const payload = JSON.parse(result.stdout);
        expect(payload.status).toBe('failed');
        expect(payload.error.code).toBe('ORACLE_SESSION_ALREADY_RUNNING');
        expect(payload.error.recovery).toContain('oracle session <id>');
        expect(payload.error.recovery).toContain('ORACLE_HOME_DIR');
        expect(payload.error.recovery).toContain('--force');
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  }, 30_000);

  test('oracle dry run renders the copy-profile transport and records it in session meta', () => {
    withRepo((repoRoot) => {
      const { userDataDir } = bindChromeProfile(repoRoot);
      const dryRun = runChatgpt([
        'browser-consult',
        '--repo',
        repoRoot,
        '--prompt',
        'Reply exactly OK',
        '--dry-run',
      ]);
      expect(dryRun.status).toBe(0);
      const payload = JSON.parse(dryRun.stdout);
      expect(payload.status).toBe('dry_run');
      const command = (payload.dryRun.command as string[]).join(' ');
      expect(command).toContain(`--copy-profile ${userDataDir}`);
      expect(command).toContain('--browser-chrome-profile Profile 1');
      expect(command).not.toContain('--browser-cookie-path');
      const meta = JSON.parse(readFileSync(join(repoRoot, '.ai/harness/chatgpt/sessions', payload.sessionId, 'meta.json'), 'utf-8'));
      expect(meta.browser.transport).toBe('copy_profile');
    });
  }, 30_000);

  test('oracle dry run without a profile binding records the oracle session transport', () => {
    withRepo((repoRoot) => {
      const dryRun = runChatgpt([
        'browser-consult',
        '--repo',
        repoRoot,
        '--prompt',
        'Reply exactly OK',
        '--dry-run',
      ]);
      expect(dryRun.status).toBe(0);
      const payload = JSON.parse(dryRun.stdout);
      const command = (payload.dryRun.command as string[]).join(' ');
      expect(command).not.toContain('--copy-profile');
      expect(command).not.toContain('--browser-chrome-profile');
      const meta = JSON.parse(readFileSync(join(repoRoot, '.ai/harness/chatgpt/sessions', payload.sessionId, 'meta.json'), 'utf-8'));
      expect(meta.browser.transport).toBe('oracle_session');
    });
  }, 30_000);

  test('oracle provider downgrades an empty answer file to recoverable, not completed', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-fake-oracle-empty-'));
      try {
        const oraclePath = join(binDir, 'oracle');
        // Clean exit but no answer file written: oracle submitted, capture lost.
        writeFileSync(
          oraclePath,
          [
            '#!/bin/sh',
            'case "$1" in',
            '  --version) printf "%s\\n" "0.14.1"; exit 0;;',
            'esac',
            'printf "%s\\n" "Session ID: oracle_recover_789"',
            'exit 0',
          ].join('\n'),
        );
        chmodSync(oraclePath, 0o755);
        const result = runChatgpt([
          'browser-consult',
          '--repo',
          repoRoot,
          '--prompt',
          'Review this.',
          '--oracle-bin',
          oraclePath,
        ]);
        expect(result.status).toBe(0);
        const payload = JSON.parse(result.stdout);
        expect(payload.status).toBe('recoverable');
        expect(payload.error.code).toBe('ORACLE_CAPTURE_INCOMPLETE');
        const meta = JSON.parse(readFileSync(join(repoRoot, '.ai/harness/chatgpt/sessions', payload.sessionId, 'meta.json'), 'utf-8'));
        expect(meta.providerSessionId).toBe('oracle_recover_789');
        expect(meta.oracle.captureStatus).toBe('recoverable');
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  }, 30_000);

  test('oracle provider maps thinking to Oracle browser thinking time', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-fake-oracle-thinking-'));
      try {
        const oraclePath = join(binDir, 'oracle');
        writeFileSync(
          oraclePath,
          [
            '#!/bin/sh',
            'case "$1" in',
            '  --version) printf "%s\\n" "0.14.1"; exit 0;;',
            'esac',
            'ARGS="$*"',
            'OUT=""',
            'PREV=""',
            'for a in "$@"; do',
            '  if [ "$PREV" = "--write-output" ]; then OUT="$a"; fi',
            '  PREV="$a"',
            'done',
            'if [ -n "$OUT" ]; then printf "%s\\n" "Oracle saw: $ARGS" > "$OUT"; fi',
          ].join('\n'),
        );
        chmodSync(oraclePath, 0o755);
        const result = runChatgpt([
          'browser-consult',
          '--repo',
          repoRoot,
          '--prompt',
          'Review this.',
          '--thinking',
          'pro',
          '--model',
          'gpt-5.5-pro',
          '--oracle-bin',
          oraclePath,
        ]);
        expect(result.status).toBe(0);
        const payload = JSON.parse(result.stdout);
        expect(payload.status).toBe('completed');
        const output = readFileSync(payload.paths.output, 'utf-8');
        expect(output).toContain('--model gpt-5.5-pro --browser-model-strategy select');
        expect(output).toContain('--browser-thinking-time pro');
        const meta = JSON.parse(readFileSync(join(repoRoot, '.ai/harness/chatgpt/sessions', payload.sessionId, 'meta.json'), 'utf-8'));
        expect(meta.model.thinking).toBe('pro');
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  }, 30_000);

  test('oracle rejection of a thinking value fails closed without a local fallback', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-fake-oracle-bad-thinking-'));
      try {
        const oraclePath = join(binDir, 'oracle');
        writeFileSync(
          oraclePath,
          [
            '#!/bin/sh',
            'case "$1" in',
            '  --version) printf "%s\\n" "0.14.1"; exit 0;;',
            'esac',
            'PREV=""',
            'for a in "$@"; do',
            '  if [ "$PREV" = "--browser-thinking-time" ] && [ "$a" = "bogus" ]; then',
            '    printf "%s\\n" "error: option \'--browser-thinking-time <level>\' argument \'bogus\' is invalid" >&2',
            '    exit 1',
            '  fi',
            '  PREV="$a"',
            'done',
          ].join('\n'),
        );
        chmodSync(oraclePath, 0o755);
        const result = runChatgpt([
          'browser-consult',
          '--repo',
          repoRoot,
          '--prompt',
          'Review this.',
          '--thinking',
          'bogus',
          '--oracle-bin',
          oraclePath,
        ]);
        const payload = JSON.parse(result.stdout);
        expect(payload.status).toBe('failed');
        expect(payload.error.code).toBe('ORACLE_EXIT_NONZERO');
        const meta = JSON.parse(readFileSync(join(repoRoot, '.ai/harness/chatgpt/sessions', payload.sessionId, 'meta.json'), 'utf-8'));
        expect(meta.status).toBe('failed');
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  }, 30_000);

  test('oracle app preselection fails closed when the binary lacks browser-app support', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-fake-oracle-no-app-'));
      try {
        const oraclePath = join(binDir, 'oracle');
        writeFileSync(
          oraclePath,
          [
            '#!/bin/sh',
            'case "$1" in',
            '  --version) printf "%s\\n" "0.14.1"; exit 0;;',
            '  --help|--debug-help) printf "%s\\n" "Usage: oracle --engine browser --write-output <p> --browser-thinking-time <level>"; exit 0;;',
            'esac',
            'for a in "$@"; do',
            '  if [ "$a" = "--dry-run" ]; then exit 0; fi',
            'done',
            'printf "%s\\n" "unexpected oracle execution" >&2',
            'exit 23',
          ].join('\n'),
        );
        chmodSync(oraclePath, 0o755);
        const result = runChatgpt([
          'browser-consult',
          '--repo',
          repoRoot,
          '--prompt',
          'Review this.',
          '--chatgpt-app',
          'team-review-mcp',
          '--oracle-bin',
          oraclePath,
        ]);
        expect(result.status).toBe(0);
        const payload = JSON.parse(result.stdout);
        expect(payload.status).toBe('failed');
        expect(payload.error.code).toBe('ORACLE_APP_PRESELECT_UNSUPPORTED');
        const output = readFileSync(payload.paths.output, 'utf-8');
        expect(output).toContain('does not support ChatGPT app preselection');
        expect(output).not.toContain('unexpected oracle execution');
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  }, 30_000);

  test('oracle provider passes ChatGPT app preselection to Oracle when supported', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-fake-oracle-app-'));
      try {
        const oraclePath = join(binDir, 'oracle');
        writeFileSync(
          oraclePath,
          [
            '#!/bin/sh',
            'case "$1" in',
            '  --version) printf "%s\\n" "0.14.1"; exit 0;;',
            '  --help|--debug-help) printf "%s\\n" "Usage: oracle --engine browser --write-output <p> --browser-app <name> --browser-thinking-time <level>"; exit 0;;',
            'esac',
            'ARGS="$*"',
            'OUT=""',
            'PREV=""',
            'for a in "$@"; do',
            '  if [ "$PREV" = "--write-output" ]; then OUT="$a"; fi',
            '  PREV="$a"',
            'done',
            'if [ -n "$OUT" ]; then printf "%s\\n" "Oracle saw: $ARGS" > "$OUT"; fi',
          ].join('\n'),
        );
        chmodSync(oraclePath, 0o755);
        const result = runChatgpt([
          'browser-consult',
          '--repo',
          repoRoot,
          '--prompt',
          'Review this.',
          '--chatgpt-app',
          'team-review-mcp',
          '--oracle-bin',
          oraclePath,
        ]);
        expect(result.status).toBe(0);
        const payload = JSON.parse(result.stdout);
        expect(payload.status).toBe('completed');
        const output = readFileSync(payload.paths.output, 'utf-8');
        expect(output).toContain('--browser-app team-review-mcp');
        const meta = JSON.parse(readFileSync(join(repoRoot, '.ai/harness/chatgpt/sessions', payload.sessionId, 'meta.json'), 'utf-8'));
        expect(meta.browser.chatgptApp).toBe('team-review-mcp');
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  }, 30_000);

  test('oracle doctor probes binary capabilities and reports ready', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-fake-oracle-doctor-'));
      try {
        const oraclePath = join(binDir, 'oracle');
        writeFileSync(
          oraclePath,
          [
            '#!/bin/sh',
            'case "$1" in',
            '  --version) printf "%s\\n" "0.14.1";;',
            '  *) printf "%s\\n" "Usage: oracle --engine browser --browser-archive never --write-output <p> --browser-follow-up <t> --followup <id> --browser-model-strategy current --browser-cookie-path <path> --copy-profile <dir> --browser-chrome-profile <name> --chatgpt-url <url> --heartbeat <seconds>";;',
            'esac',
          ].join('\n'),
        );
        chmodSync(oraclePath, 0o755);
        const doctor = runChatgpt(['browser-doctor', '--repo', repoRoot, '--provider', 'oracle', '--oracle-bin', oraclePath, '--json']);
        expect(doctor.status).toBe(0);
        const readiness = JSON.parse(doctor.stdout);
        expect(readiness.status).toBe('ready');
        expect(readiness.agent_actions).toEqual([]);
        expect(readiness.oracle.installed).toBe(true);
        expect(readiness.oracle.binary).toBe(oraclePath);
        expect(readiness.oracle.version).toBe('0.14.1');
        expect(readiness.oracle.capabilities).toEqual({
          browserEngine: true,
          writeOutput: true,
          browserFollowup: true,
          sessionFollowup: true,
          browserArchive: true,
          browserModelStrategy: true,
          browserCookiePath: true,
          copyProfile: true,
          browserChromeProfile: true,
          browserThinkingTime: true,
          chatgptUrl: true,
          heartbeat: true,
        });
        expect(readiness.oracle.optionalCapabilities).toEqual({
          browserAppPreselect: false,
        });
        expect(readiness.oracle.missingCapabilities).toEqual([]);

        const missing = runChatgpt(['browser-doctor', '--repo', repoRoot, '--provider', 'oracle', '--oracle-bin', join(binDir, 'nope'), '--json'], ROOT, {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH ?? ''}`,
        });
        const missingReadiness = JSON.parse(missing.stdout);
        expect(missingReadiness.status).toBe('unavailable');
        expect(missingReadiness.code).toBe('ORACLE_NOT_INSTALLED');
        expect(missingReadiness.oracle.installed).toBe(false);
        expect(missingReadiness.oracle.resolvedFrom).toBe('--oracle-bin');
        expect(missingReadiness.oracle.error.message).toContain('--oracle-bin');
        expect(missingReadiness.agent_actions).toHaveLength(1);
        expect(missingReadiness.agent_actions[0]).toMatchObject({
          id: 'chatgpt-oracle-fix-configured-source',
          status: 'needs_agent',
          requires_agent: true,
          command: 'repo-harness chatgpt browser-doctor --repo <repo> --provider oracle --oracle-bin <path-to-pinned-oracle> --json',
          automatic: false,
          verification: 'repo-harness chatgpt browser-doctor --repo <repo> --provider oracle --json',
        });
        expect(missingReadiness.agent_actions[0].reason).toContain('--oracle-bin');
        expect(missingReadiness.agent_actions[0].reason).toContain('globally will not fix');
        expect(missingReadiness.agent_actions[0].risk).toContain('explicit Oracle binary selection');
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  }, 30_000);

  test('oracle doctor requires every runtime flag before reporting ready', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-fake-oracle-incompatible-'));
      try {
        const oraclePath = join(binDir, 'oracle');
        writeFileSync(
          oraclePath,
          [
            '#!/bin/sh',
            'for a in "$@"; do',
            '  if [ "$a" = "--browser-thinking-time" ]; then printf "%s\\n" "error: unknown option --browser-thinking-time" >&2; exit 1; fi',
            'done',
            'case "$1" in',
            '  --version) printf "%s\\n" "0.14.1";;',
            '  *) printf "%s\\n" "Usage: oracle --engine browser --write-output <p>";;',
            'esac',
          ].join('\n'),
        );
        chmodSync(oraclePath, 0o755);
        const doctor = runChatgpt(['browser-doctor', '--repo', repoRoot, '--provider', 'oracle', '--oracle-bin', oraclePath, '--json']);
        expect(doctor.status).toBe(0);
        const readiness = JSON.parse(doctor.stdout);
        expect(readiness.status).toBe('action_required');
        expect(readiness.code).toBe('ORACLE_INCOMPATIBLE');
        expect(readiness.oracle.capabilities).toEqual({
          browserEngine: true,
          writeOutput: true,
          browserFollowup: false,
          sessionFollowup: false,
          browserArchive: false,
          browserModelStrategy: false,
          browserCookiePath: false,
          copyProfile: false,
          browserChromeProfile: false,
          browserThinkingTime: false,
          chatgptUrl: false,
          heartbeat: false,
        });
        expect(readiness.oracle.missingCapabilities).toEqual(['browserFollowup', 'sessionFollowup', 'browserArchive', 'browserModelStrategy', 'browserCookiePath', 'copyProfile', 'browserChromeProfile', 'browserThinkingTime', 'chatgptUrl', 'heartbeat']);
        expect(readiness.oracle.error.message).toContain('browserFollowup');
        expect(readiness.agent_actions).toHaveLength(1);
        expect(readiness.agent_actions[0]).toMatchObject({
          id: 'chatgpt-oracle-fix-configured-source',
          status: 'needs_agent',
          requires_agent: true,
          command: 'repo-harness chatgpt browser-doctor --repo <repo> --provider oracle --oracle-bin <path-to-pinned-oracle> --json',
          automatic: false,
        });
        expect(readiness.agent_actions[0].reason).toContain('browserFollowup');
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  }, 30_000);

  test('oracle doctor is not ready without the copy-profile transport flags', () => {
    withRepo((repoRoot) => {
      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-fake-oracle-no-transport-'));
      try {
        const oraclePath = join(binDir, 'oracle');
        writeFileSync(
          oraclePath,
          [
            '#!/bin/sh',
            'case "$1" in',
            '  --version) printf "%s\\n" "0.14.1";;',
            '  *) printf "%s\\n" "Usage: oracle --engine browser --browser-archive never --write-output <p> --browser-follow-up <t> --followup <id> --browser-model-strategy current --browser-cookie-path <path> --chatgpt-url <url> --heartbeat <seconds>";;',
            'esac',
          ].join('\n'),
        );
        chmodSync(oraclePath, 0o755);
        const doctor = runChatgpt(['browser-doctor', '--repo', repoRoot, '--provider', 'oracle', '--oracle-bin', oraclePath, '--json']);
        expect(doctor.status).toBe(0);
        const readiness = JSON.parse(doctor.stdout);
        expect(readiness.status).toBe('action_required');
        expect(readiness.code).toBe('ORACLE_INCOMPATIBLE');
        expect(readiness.oracle.capabilities.copyProfile).toBe(false);
        expect(readiness.oracle.capabilities.browserChromeProfile).toBe(false);
        expect(readiness.oracle.missingCapabilities).toEqual(['copyProfile', 'browserChromeProfile']);
        expect(readiness.oracle.error.message).toContain('copyProfile');
        expect(readiness.oracle.error.message).toContain('browserChromeProfile');
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  }, 30_000);

  test('oracle doctor repairs repo-local and env-selected binaries through source-aware actions', () => {
    withRepo((repoRoot) => {
      const repoBinDir = join(repoRoot, 'node_modules/.bin');
      mkdirSync(repoBinDir, { recursive: true });
      const repoOracle = join(repoBinDir, 'oracle');
      writeFileSync(
        repoOracle,
        [
          '#!/bin/sh',
          'case "$1" in',
          '  --version) printf "%s\\n" "0.14.1";;',
          '  *) printf "%s\\n" "Usage: oracle --engine browser --write-output <p>";;',
          'esac',
        ].join('\n'),
      );
      chmodSync(repoOracle, 0o755);

      const repoLocal = runChatgpt(['browser-doctor', '--repo', repoRoot, '--provider', 'oracle', '--json']);
      expect(repoLocal.status).toBe(0);
      const repoLocalReadiness = JSON.parse(repoLocal.stdout);
      expect(repoLocalReadiness.status).toBe('action_required');
      expect(repoLocalReadiness.oracle.resolvedFrom).toBe('node_modules/.bin');
      expect(repoLocalReadiness.agent_actions[0]).toMatchObject({
        id: 'chatgpt-oracle-upgrade-pinned',
        command: 'bun add -D @steipete/oracle@0.14.1',
      });

      const envSelected = runChatgpt(['browser-doctor', '--repo', repoRoot, '--provider', 'oracle', '--json'], ROOT, {
        ...process.env,
        REPO_HARNESS_ORACLE_BIN: join(repoRoot, 'missing-oracle'),
      });
      expect(envSelected.status).toBe(0);
      const envReadiness = JSON.parse(envSelected.stdout);
      expect(envReadiness.status).toBe('unavailable');
      expect(envReadiness.oracle.resolvedFrom).toBe('REPO_HARNESS_ORACLE_BIN');
      expect(envReadiness.agent_actions[0]).toMatchObject({
        id: 'chatgpt-oracle-fix-configured-source',
        command: 'REPO_HARNESS_ORACLE_BIN=<path-to-pinned-oracle> repo-harness chatgpt browser-doctor --repo <repo> --provider oracle --json',
      });
    });
  }, 30_000);

  test('oracle follow-up uses providerSessionId instead of local sessionId', () => {
    withRepo((repoRoot) => {
      const initial = runChatgpt([
        'browser-consult',
        '--repo',
        repoRoot,
        '--dry-run',
        '--prompt',
        'Start.',
      ]);
      expect(initial.status).toBe(0);
      const initialPayload = JSON.parse(initial.stdout);
      const metaPath = join(repoRoot, '.ai/harness/chatgpt/sessions', initialPayload.sessionId, 'meta.json');
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      meta.providerSessionId = 'oracle_upstream_123';
      writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
      const userDataDir = join(repoRoot, 'Chrome/User Data');
      const profileDir = join(userDataDir, 'Profile 1');
      mkdirSync(profileDir, { recursive: true });
      writeFileSync(join(userDataDir, 'Local State'), '{}\n');
      writeFileSync(join(profileDir, 'Preferences'), '{}\n');
      writeFileSync(join(profileDir, 'Cookies'), 'fake cookie db\n');
      const setup = runChatgpt([
        'browser-setup',
        '--repo',
        repoRoot,
        '--profile-dir',
        profileDir,
        '--browser-channel',
        'chrome',
      ]);
      expect(setup.status).toBe(0);

      const binDir = mkdtempSync(join(tmpdir(), 'repo-harness-fake-oracle-followup-bin-'));
      try {
        const oraclePath = join(binDir, 'oracle');
        writeFileSync(
          oraclePath,
          [
            '#!/bin/sh',
            'case "$1" in',
            '  --version) printf "%s\\n" "0.14.1"; exit 0;;',
            'esac',
            'ARGS="$*"',
            'OUT=""',
            'PREV=""',
            'for a in "$@"; do',
            '  if [ "$PREV" = "--write-output" ]; then OUT="$a"; fi',
            '  PREV="$a"',
            'done',
            'printf "%s\\n" "Session ID: oracle_followup_456"',
            'if [ -n "$OUT" ]; then printf "%s\\n" "Oracle saw: $ARGS" > "$OUT"; fi',
          ].join('\n'),
        );
        chmodSync(oraclePath, 0o755);
        const followup = runChatgpt([
          'browser-followup',
          '--repo',
          repoRoot,
          '--session',
          initialPayload.sessionId,
          '--prompt',
          'Continue.',
          '--oracle-bin',
          oraclePath,
        ]);
        expect(followup.status).toBe(0);
        const followupPayload = JSON.parse(followup.stdout);
        const output = readFileSync(followupPayload.paths.output, 'utf-8');
        expect(output).toContain('--followup oracle_upstream_123');
        expect(output).not.toContain(initialPayload.sessionId);
        expect(output).not.toContain('--browser-cookie-path');
        const followupMeta = JSON.parse(readFileSync(join(repoRoot, '.ai/harness/chatgpt/sessions', followupPayload.sessionId, 'meta.json'), 'utf-8'));
        // Parent linkage points at the source conversation; the new session's own
        // providerSessionId reflects what oracle returned for the reopened run.
        expect(followupMeta.parentProviderSessionId).toBe('oracle_upstream_123');
        expect(followupMeta.providerSessionId).toBe('oracle_followup_456');
      } finally {
        rmSync(binDir, { recursive: true, force: true });
      }
    });
  }, 30_000);

  test('rejects invalid session ids for read/open surfaces', () => {
    withRepo((repoRoot) => {
      const read = runChatgpt(['browser-session', '--repo', repoRoot, '../secret']);
      expect(read.status).toBe(2);
      expect(read.stderr).toContain('invalid ChatGPT browser session id');
    });
  }, 30_000);

  test('ships browser engine docs', () => {
    // SSD-06 migration: docs/repo-harness-chatgpt-browser-engine.md documents
    // the SURVIVING src/cli/chatgpt-browser CLI engine (R3) and stays
    // byte-unchanged by this cutover; this half of the test is untouched.
    const guide = join(ROOT, 'docs/repo-harness-chatgpt-browser-engine.md');
    expect(readFileSync(guide, 'utf-8')).toContain('repo-harness chatgpt browser-consult');
    expect(readFileSync(guide, 'utf-8')).toContain('--provider native');
    expect(readFileSync(guide, 'utf-8')).not.toContain('--provider bridge');
    expect(readFileSync(guide, 'utf-8')).toContain('--browser-channel chrome');
    expect(readFileSync(guide, 'utf-8')).toContain('.ai/harness/handoff/gptpro/chatgpt-review-${stamp}.md');
    expect(readFileSync(guide, 'utf-8')).toContain('docs/researches/YYYYMMDD-<topic>.md');
    expect(readFileSync(guide, 'utf-8')).toContain('not `oracle-mcp`');
    expect(readFileSync(join(ROOT, 'docs/researches/README.md'), 'utf-8')).toContain('.ai/harness/handoff/gptpro/');
    expect(readFileSync(guide, 'utf-8')).toContain('Oracle CLI package currently requires `node >=24`');
    expect(readFileSync(guide, 'utf-8')).toContain('agent_actions');
    expect(readFileSync(guide, 'utf-8')).toContain('chatgpt-oracle-install-pinned');
    expect(readFileSync(guide, 'utf-8')).toContain('--chatgpt-app <serverName>');
    expect(readFileSync(guide, 'utf-8')).toContain('chatgpt install-skill --target both');
    expect(readFileSync(guide, 'utf-8')).toContain('PROMPT_SECRET_SCAN_FAILED');
    expect(readFileSync(guide, 'utf-8')).toContain('meta.security.promptSecretScan');
    expect(readFileSync(guide, 'utf-8')).toContain('immutable staged paths');
  });

  // SSD-06 migration: the static .agents/skills/repo-harness-chatgpt-browser/
  // source dir and the assets/skill-commands/repo-harness-gptpro facade are
  // both deleted. Their content reconciled into the one canonical
  // repo-harness-chatgpt package (SSD-05); these path-specific assertions
  // migrate to that package's setup/consult/read-back references.
  test('canonical repo-harness-chatgpt package carries the Oracle setup and GPT Pro consult/read-back content', () => {
    const setup = readFileSync(join(ROOT, 'assets/skills/repo-harness-chatgpt/references/setup.md'), 'utf-8');
    expect(setup).toContain('--provider oracle --json');
    expect(setup).toContain('node >=24');
    expect(setup).toContain('chatgpt-oracle-install-pinned');
    expect(setup).toContain('default repo-harness install');
    expect(setup).toContain('chatgpt install-skill --target both');
    expect(setup).toContain('Gitleaks CLI >= 8.19');

    const consult = readFileSync(join(ROOT, 'assets/skills/repo-harness-chatgpt/references/consult.md'), 'utf-8');
    expect(consult).toContain('date -u +%Y%m%dT%H%M%SZ');
    expect(consult).toContain('.ai/harness/handoff/gptpro/gptpro-${stamp}-<slug>.md');
    expect(consult).toContain('--model gpt-5.5-pro');
    expect(consult).toContain('commonly take 15');
    expect(consult).toContain('minutes or more');
    expect(consult).toContain('Do not treat elapsed time as failure');
    expect(consult).toContain('no thinking status detected yet');
    expect(consult).not.toContain('gptpro-consult.md');

    const readBack = readFileSync(join(ROOT, 'assets/skills/repo-harness-chatgpt/references/read-back.md'), 'utf-8');
    expect(readBack).toContain('chatgpt.serverName');
    expect(readBack).toContain('MCP Read Evidence');
    expect(readBack).toContain('right-side process pane');
    expect(readBack).toContain('Called tool');
    expect(readBack).toContain('sandbox/process flow');
    assertChatGptMcpContract(readBack);

    const bridge = readFileSync(join(ROOT, 'assets/skills/repo-harness-chatgpt/references/bridge.md'), 'utf-8');
    expect(bridge).toContain('.repo-harness/mcp.local.json');

    const delegate = readFileSync(join(ROOT, 'assets/skills/repo-harness-chatgpt/references/delegate.md'), 'utf-8');
    expect(delegate).toContain('browser-consult --dry-run --secret-scan');
    expect(delegate).toContain('PROMPT_SECRET_SCAN_UNAVAILABLE');
    expect(delegate).toContain('meta.security.promptSecretScan');
    expect(delegate).not.toContain('Because there is no scanner');
  });
});
