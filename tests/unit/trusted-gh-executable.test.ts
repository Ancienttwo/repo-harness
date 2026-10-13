import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { type Stats } from 'node:fs';
import { win32, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  nativeWindowsSystemToolsDirectory,
  resolveTrustedGhExecutable,
  type ProtectedHelperFileAccess,
} from '../../src/effects/runtime/protected-helper-platform';

const GH = 'C:\\Program Files\\GitHub CLI\\gh.exe';
const SYSTEM = 'C:\\Windows\\System32';
type Kind = 'file' | 'directory' | 'symlink';
function files(entries: Record<string, Kind>, redirected: Record<string, string> = {}): Pick<ProtectedHelperFileAccess, 'exists' | 'lstat' | 'realpath'> {
  return {
    exists: path => entries[path] !== undefined,
    lstat: path => ({
      mode: 0o600,
      isFile: () => entries[path] === 'file',
      isSymbolicLink: () => entries[path] === 'symlink',
      isDirectory: () => entries[path] === 'directory',
    }) as Stats,
    realpath: path => redirected[path] ?? path,
  };
}
const windows = { platform: 'win32' as const, nativeSystemToolsDirectory: SYSTEM };

test('Windows selects the fixed standard gh.exe without POSIX executable bits', () => {
  expect(resolveTrustedGhExecutable(files({ [GH]: 'file' }), windows)).toBe(GH);
  const driveGh = 'D:\\Program Files\\GitHub CLI\\gh.exe';
  expect(resolveTrustedGhExecutable(files({ [driveGh]: 'file' }), {
    ...windows, nativeSystemToolsDirectory: 'D:\\Windows\\System32',
  })).toBe(driveGh);
});

test('Windows missing gh refuses arbitrary user, PATH and POSIX installs', () => {
  const paths: string[] = [];
  const access = files({ 'C:\\attacker\\gh.exe': 'file', '/usr/bin/gh': 'file' });
  expect(resolveTrustedGhExecutable({ ...access, exists: path => { paths.push(path); return access.exists(path); } }, windows)).toBeUndefined();
  expect(paths).toEqual([GH]);
});

test.each(['directory', 'symlink'] as const)('Windows rejects a %s at the fixed executable path', kind => {
  expect(() => resolveTrustedGhExecutable(files({ [GH]: kind }), windows)).toThrow('non-symlink regular file');
});

test('Windows rejects redirected executable or ancestor junction targets', () => {
  const attacker = 'C:\\attacker\\gh.exe';
  expect(() => resolveTrustedGhExecutable(files({ [GH]: 'file', [attacker]: 'file' }, { [GH]: attacker }), windows))
    .toThrow('fixed host install path');
  expect(() => resolveTrustedGhExecutable(files({ [GH]: 'file', [attacker]: 'symlink' }, { [GH]: attacker }), windows))
    .toThrow('resolve to a regular file');
});

test.each(['relative\\System32', '\\\\server\\share\\Windows\\System32', '\\Windows\\System32'])(
  'Windows refuses a non-local or unqualified native system path: %s', nativeSystemToolsDirectory => {
    expect(() => resolveTrustedGhExecutable(files({ [GH]: 'file' }), { ...windows, nativeSystemToolsDirectory })).toThrow();
  },
);

test('Windows propagates unreadable file metadata without a caller fallback', () => {
  expect(() => resolveTrustedGhExecutable({ ...files({ [GH]: 'file' }), lstat: () => { throw Error('denied metadata'); } }, windows))
    .toThrow('denied metadata');
});

// Diagnostics contain no environment values, paths, or raw child output.
function processDiagnostic(result: {
  status: number | null; signal: NodeJS.Signals | null;
  error?: Error & { code?: string }; stdout?: string | Buffer | null; stderr?: string | Buffer | null;
}, elapsedMs: number, timeoutMs: number) {
  const error = result.error;
  const code = error && typeof error.code === 'string' && /^[A-Z][A-Z0-9_]{0,31}$/.test(error.code) ? error.code : null;
  let message = `<redacted process error: ${code ?? 'unknown'}>`;
  if (error && (error.message === code || error.message.startsWith('spawnSync '))) {
    message = `spawnSync <executable> ${code ?? '<unknown-code>'}`;
  } else if (error && /^ENOENT: no such file or directory, posix_spawn '[^']*'$/.test(error.message)) {
    message = "ENOENT: no such file or directory, posix_spawn '<executable>'";
  }

  return {
    status: result.status, signal: result.signal, elapsedMs: Math.round(elapsedMs), timeoutMs,
    error: error ? { code, message } : null,
    stdoutBytes: Buffer.byteLength(result.stdout ?? ''), stderrBytes: Buffer.byteLength(result.stderr ?? ''),
  };
}

// Share the actual child serialization with portable process-boundary regressions.
const VERSION_PROBE_BODY = `const started=performance.now();
const result=spawnSync(bin,args,{encoding:'utf8',timeout:timeoutMs});
const probe=(${processDiagnostic.toString()})(result,performance.now()-started,timeoutMs);
console.log(JSON.stringify({bin,status:result.status,stdout:result.stdout,stderr:result.stderr,probe}));`;

function portableProbe(bin: string, args: string[], timeoutMs = 10000) {
  const child = spawnSync(process.execPath, ['-e', `import {spawnSync} from 'node:child_process';
const bin=${JSON.stringify(bin)},args=${JSON.stringify(args)},timeoutMs=${timeoutMs};
${VERSION_PROBE_BODY}`], { encoding: 'utf8', timeout: 20000 });
  expect(child.status, child.stderr).toBe(0);
  return JSON.parse(child.stdout);
}

test('version probe preserves successful process diagnostics', () => {
  const observed = portableProbe(process.execPath, ['--version']);
  expect(observed.status).toBe(0);
  expect(observed.probe).toMatchObject({ error: null, signal: null, timeoutMs: 10000 });
  expect(observed.probe.elapsedMs).toBeGreaterThanOrEqual(0);
});

test('version probe retains missing-executable evidence without exposing the private path', () => {
  const missing = join(tmpdir(), `private-gh-missing-${crypto.randomUUID()}`);
  const observed = portableProbe(missing, ['--version']);
  expect(observed.status).toBeNull();
  expect(observed.probe.error.code).toBe('ENOENT');
  expect(observed.probe.error.message).toContain('ENOENT');
  expect(observed.probe.error.message.length).toBeLessThanOrEqual(256);
  expect(JSON.stringify(observed.probe)).not.toContain(missing);
});

test('process diagnostics redact unknown messages and omit raw output', () => {
  const privateValue = 'controlled-private-path-and-token';
  const error = Object.assign(new Error(privateValue), { code: 'EACCES' });
  const observed = processDiagnostic({ status: null, signal: null, error, stdout: privateValue, stderr: privateValue }, 2, 10000);
  expect(observed.error).toEqual({ code: 'EACCES', message: '<redacted process error: EACCES>' });
  expect(observed.stdoutBytes).toBe(Buffer.byteLength(privateValue));
  expect(observed.stderrBytes).toBe(Buffer.byteLength(privateValue));
  expect(JSON.stringify(observed)).not.toContain(privateValue);
});

test('version probe retains actual timeout evidence and signal', () => {
  const observed = portableProbe(process.execPath, ['-e', 'await Bun.sleep(60000)'], 100);
  expect(observed.status).toBeNull();
  expect(observed.probe.error.code).toBe('ETIMEDOUT');
  expect(observed.probe.elapsedMs).toBeGreaterThanOrEqual(100);
  expect(observed.probe.timeoutMs).toBe(100);
  expect('signal' in observed.probe).toBe(true);
});

const nativeWindows = process.platform === 'win32' ? test : test.skip;
// Prior runs show slower first launches, but did not capture the historical
// null-status error/signal. Retain main's possible cold-start mitigation budget;
// diagnostics below do not claim that the original cause is confirmed.
const COLD_GH_LAUNCH_MS = 45_000;
nativeWindows('native Windows executes the preinstalled fixed gh with hostile caller environment', () => {
  const module = fileURLToPath(new URL('../../src/effects/runtime/protected-helper-platform.ts', import.meta.url));
  const code = `import {resolveTrustedGhExecutable} from ${JSON.stringify(module)};
import {spawnSync} from 'node:child_process';
const bin=resolveTrustedGhExecutable();
if(!bin) throw Error('fixed standard GitHub CLI installation unavailable');
const args=['--version'],timeoutMs=${COLD_GH_LAUNCH_MS};
${VERSION_PROBE_BODY}`;
  const started = performance.now();
  const child = spawnSync(process.execPath, ['-e', code], {
    encoding: 'utf8', timeout: COLD_GH_LAUNCH_MS + 5_000,
    env: { ...process.env, PATH: 'C:\\repo-harness-attacker',
      GH_BIN: 'C:\\repo-harness-attacker\\gh.exe', REPO_HARNESS_GH_BIN: 'C:\\repo-harness-attacker\\gh.exe',
      ProgramFiles: 'C:\\repo-harness-attacker',
      SystemRoot: 'C:\\repo-harness-attacker', WINDIR: 'C:\\repo-harness-attacker' },
  });
  const outer = processDiagnostic(child, performance.now() - started, COLD_GH_LAUNCH_MS + 5_000);
  expect(child.status, JSON.stringify({ layer: 'outer-bun', systemDirectoryEnv: 'hostile', ...outer })).toBe(0);
  const observed = JSON.parse(child.stdout);
  console.info('[trusted-gh-version-probe]', JSON.stringify({ systemDirectoryEnv: 'hostile', outer, inner: observed.probe }));
  const expected = win32.join(win32.parse(nativeWindowsSystemToolsDirectory()).root, 'Program Files', 'GitHub CLI', 'gh.exe');
  expect(observed.bin.toLowerCase()).toBe(expected.toLowerCase());
  expect(observed.status, JSON.stringify({ layer: 'inner-gh', systemDirectoryEnv: 'hostile', ...observed.probe })).toBe(0);
  expect(observed.stdout).toMatch(/^gh version /);
}, COLD_GH_LAUNCH_MS + 10_000);
