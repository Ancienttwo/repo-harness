import { lstatSync, realpathSync, mkdirSync, existsSync, readFileSync, openSync, closeSync, constants, fstatSync, writeFileSync, fsyncSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { isAbsolute, relative, sep, join, dirname, resolve } from 'node:path';

export interface ReviewIsolationPaths {
  readonly subject: string;
  readonly primary: string;
  readonly ownerRecord: string;
  readonly journal: string;
  readonly gitCommonDir: string;
  readonly output: string;
}

function inside(path: string, directory: string): boolean {
  const rest = relative(directory, path);
  return rest === '' || (!isAbsolute(rest) && rest !== '..' && !rest.startsWith(`..${sep}`));
}

function ownedOutput(output: string): string {
  if (!isAbsolute(output) || lstatSync(output).isSymbolicLink() || !lstatSync(output).isDirectory()) throw new Error('review_codex_home_unsafe');
  return realpathSync(output);
}
function assertAccessWindow(bytes: Buffer, runWindowMs: number): void {
  if (!Number.isSafeInteger(runWindowMs) || runWindowMs < 1) throw new Error('review_auth_window_invalid');
  let exp: unknown;
  try {
    const value = JSON.parse(bytes.toString('utf8'));
    const token = value.tokens?.access_token;
    if (typeof token !== 'string') throw new Error();
    exp = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')).exp;
  } catch { throw new Error('review_access_exp_unverified'); }
  if (typeof exp !== 'number' || !Number.isFinite(exp) || exp * 1000 <= Date.now() + runWindowMs) throw new Error('review_access_expires_within_run');
}
function readAuthBytes(path: string): Buffer {
  let fd: number;
  try { fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
  catch { throw new Error('review_auth_source_unavailable'); }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error('review_auth_source_unsafe');
    return readFileSync(fd);
  } finally { closeSync(fd); }
}

/** Owner-only credential preparation. Never called by the sandboxed host. */
export function prepareCodexHome(output: string, sourceHome: string, runWindowMs: number, reuse = false): { home: string; auth_copied: true; mode: '0600' } {
  try {
    const home = join(ownedOutput(output), '.codex-home');
    try { mkdirSync(home, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw new Error('review_codex_home_create_failed'); }
    const dir = lstatSync(home);
    if (!dir.isDirectory() || dir.isSymbolicLink() || dir.uid !== process.getuid?.() || (dir.mode & 0o777) !== 0o700) throw new Error('review_codex_home_unsafe');
    const destination = join(home, 'auth.json');
    if (reuse) {
      const stat = lstatSync(destination);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o600) throw new Error('review_auth_copy_unsafe');
      const bytes = readAuthBytes(destination);
      try { assertAccessWindow(bytes, runWindowMs); } finally { bytes.fill(0); }
      return { home, auth_copied: true, mode: '0600' };
    }
    const sourceDirectory = join(realpathSync(sourceHome), '.codex');
    if (lstatSync(sourceDirectory).isSymbolicLink() || !lstatSync(sourceDirectory).isDirectory()) throw new Error('review_auth_source_unsafe');
    const bytes = readAuthBytes(join(sourceDirectory, 'auth.json'));
    let fd: number | undefined; let created = false;
    try {
      assertAccessWindow(bytes, runWindowMs);
      fd = openSync(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); created = true;
      writeFileSync(fd, bytes); fsyncSync(fd);
    } catch (error) {
      if (created) {
        if (fd !== undefined) { closeSync(fd); fd = undefined; }
        if (removeCopiedAuth(output).status === 'cleanup_pending') throw new Error('cleanup_pending: review_auth_copy_delete_failed');
      }
      if (error instanceof Error && /^review_access_/.test(error.message)) throw error;
      throw new Error('review_auth_copy_failed');
    } finally { if (fd !== undefined) closeSync(fd); bytes.fill(0); }
    return { home, auth_copied: true, mode: '0600' };
  } catch (error) {
    if (error instanceof Error && /^(review_|cleanup_pending:)/.test(error.message)) throw error;
    throw new Error('review_auth_preflight_failed');
  }
}

/** Delete only the isolated copy; never follow a directory link or touch source. */
export function removeCopiedAuth(output: string): { status: 'removed' | 'absent' | 'cleanup_pending' } {
  try {
    const home = join(ownedOutput(output), '.codex-home');
    let stat;
    try { stat = lstatSync(home); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { status: 'absent' }; throw error; }
    if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(home) !== home) return { status: 'cleanup_pending' };
    try { unlinkSync(join(home, 'auth.json')); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { status: 'absent' }; throw error; }
    return { status: 'removed' };
  } catch { return { status: 'cleanup_pending' }; }
}

/** Seatbelt owns enforcement. This emits OS policy, never vendor CLI arguments. */
export function reviewIsolationPolicy(paths: ReviewIsolationPaths, platform = process.platform): string {
  if (!isAbsolute(paths.output) || lstatSync(paths.output).isSymbolicLink() || !lstatSync(paths.output).isDirectory()) {
    throw new Error('OAR_REVIEW_OUTPUT_UNSAFE');
  }
  const output = realpathSync(paths.output);
  const protectedEntries = [paths.primary, paths.ownerRecord, paths.journal, paths.gitCommonDir];
  for (const path of [paths.subject, ...protectedEntries]) {
    if (!isAbsolute(path)) throw new Error('OAR_REVIEW_PROTECTED_PATH_UNSAFE');
    const canonical = realpathSync(path);
    if (inside(canonical, output) || protectedEntries.includes(path) && inside(output, canonical)) {
      throw new Error('OAR_REVIEW_OUTPUT_OVERLAPS_AUTHORITY');
    }
  }
  if (platform !== 'darwin') throw new Error('OAR_REVIEW_ISOLATION_UNSUPPORTED_PLATFORM');
  // Output alone is writable; every real CODEX_HOME state grant is retired.
  // Definitions, trust, settings/hooks and credentials stay denied even inside
  // an otherwise writable tree. This never opens HOME or native config roots.
  const forbiddenFiles = '/(CLAUDE\\.md|AGENTS\\.md|settings[^/]*\\.json|\\.claude\\.json|config\\.toml|auth\\.json|\\.?credentials\\.json|secrets\\.json|token\\.json)$';
  const forbiddenDirectories = '/(\\.?hooks|\\.?agents|\\.?skills|\\.?rules|\\.?plugins)(/|$)';
  const exceptions = `(require-not (subpath ${JSON.stringify(output)}))`;
  return `(version 1)\n(allow default)\n(deny file-write* (require-all ${exceptions} (require-not (literal "/dev/null"))))\n(deny file-write* (regex #"${forbiddenFiles}"))\n(deny file-write* (regex #"${forbiddenDirectories}"))\n`;

}

/** One private output-local TMPDIR; no HOME/config/credential redirection. */
export function reviewHostTemporaryDirectory(output: string): string {
  if (!isAbsolute(output) || lstatSync(output).isSymbolicLink() || !lstatSync(output).isDirectory()) throw new Error('OAR_REVIEW_OUTPUT_UNSAFE');
  const path = join(realpathSync(output), '.tmp');
  try { mkdirSync(path, { mode: 0o700 }); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  if (lstatSync(path).isSymbolicLink() || !lstatSync(path).isDirectory() || realpathSync(path) !== path) throw new Error('OAR_REVIEW_TMPDIR_UNSAFE');
  return path;
}

export interface ReviewIsolationAdmission {
  paths: ReviewIsolationPaths;
  policyFile: string;
}

/** Require the owner-admitted profile and live inherited Seatbelt before SDK Session creation. */
export function assertReviewIsolation(admission: ReviewIsolationAdmission): void {
  const expected = reviewIsolationPolicy(admission.paths);
  const file = lstatSync(admission.policyFile);
  if (!file.isFile() || file.isSymbolicLink() || file.uid !== process.getuid?.() || !(file.mode & 0o200)
    || readFileSync(admission.policyFile, 'utf8') !== expected) throw new Error('OAR_REVIEW_PROFILE_NOT_ADMITTED');
  // Open without truncation: never mutate the protected owner profile. Its
  // writable owner mode excludes a chmod-only false positive. Unconfined hosts
  // close this fd and fail before creating a Session.
  let fd: number;
  try { fd = openSync(admission.policyFile, constants.O_WRONLY | constants.O_NOFOLLOW); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw new Error('OAR_REVIEW_PROFILE_DENIAL_UNPROVEN');
    const nested = spawnSync('/usr/bin/sandbox-exec', ['-p', '(version 1)(allow default)', '/usr/bin/true'], { encoding: 'utf8', timeout: 5000 });
    if (nested.status !== 71 || !nested.stderr?.includes('sandbox_apply: Operation not permitted')) throw new Error('OAR_REVIEW_SEATBELT_UNPROVEN');
    return;
  }
  closeSync(fd);
  throw new Error('OAR_REVIEW_SEATBELT_REQUIRED');
}

/** Fixed application host bootstrap only. Native vendor args belong to OAR. */
export function isolatedHostCommand(policyFile: string, node: string, hostEntry: string, specFile: string): readonly string[] {
  for (const path of [policyFile, node, hostEntry, specFile]) if (!isAbsolute(path)) throw new Error('OAR_REVIEW_HOST_PATH_UNSAFE');
  return ['/usr/bin/sandbox-exec', '-f', policyFile, node, hostEntry, specFile];
}
