import { lstatSync, realpathSync, mkdirSync, existsSync, readFileSync, openSync, closeSync, constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { isAbsolute, relative, sep, join, dirname, resolve } from 'node:path';

export interface ReviewIsolationPaths {
  readonly subject: string;
  readonly primary: string;
  readonly ownerRecord: string;
  readonly journal: string;
  readonly gitCommonDir: string;
  readonly output: string;
  readonly nativeStateDirectories?: readonly string[];
  readonly nativeStateFiles?: readonly string[];
}

function inside(path: string, directory: string): boolean {
  const rest = relative(directory, path);
  return rest === '' || (!isAbsolute(rest) && rest !== '..' && !rest.startsWith(`..${sep}`));
}

function canonicalStateDirectory(path: string): string {
  if (!isAbsolute(path) || path.split('/').includes('..')) throw new Error('OAR_REVIEW_NATIVE_STATE_UNSAFE');
  let ancestor = path;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  if (existsSync(path) && (lstatSync(path).isSymbolicLink() || !lstatSync(path).isDirectory())) throw new Error('OAR_REVIEW_NATIVE_STATE_UNSAFE');
  return resolve(realpathSync(ancestor), relative(ancestor, path));
}

function canonicalStateFile(path: string): string {
  if (!isAbsolute(path) || path.split('/').includes('..')) throw new Error('OAR_REVIEW_NATIVE_STATE_UNSAFE');
  let stat;
  try { stat = lstatSync(path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (stat && (stat.isSymbolicLink() || !stat.isFile())) throw new Error('OAR_REVIEW_NATIVE_STATE_UNSAFE');
  return stat ? realpathSync(path) : join(realpathSync(dirname(path)), path.split('/').pop()!);
}

/** Aimpact 23:07: one tmp subpath and six SQLite literals, never the mixed root. */
export function codexNativeStatePaths(home: string): Pick<ReviewIsolationPaths, 'nativeStateDirectories' | 'nativeStateFiles'> {
  const root = join(realpathSync(home), '.codex');
  if (lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory()) throw new Error('OAR_REVIEW_CODEX_HOME_UNSAFE');
  const directory = realpathSync(root);
  const tmp = join(directory, 'tmp');
  let stat;
  try { stat = lstatSync(tmp); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) throw new Error('OAR_REVIEW_NATIVE_STATE_UNSAFE');
  return { nativeStateDirectories: [stat ? realpathSync(tmp) : tmp],
    nativeStateFiles: ['state_5.sqlite', 'logs_2.sqlite'].flatMap(file => ['', '-wal', '-shm'].map(suffix => canonicalStateFile(join(directory, file + suffix)))) };
}

/** Seatbelt owns enforcement. This emits OS policy, never vendor CLI arguments. */
export function reviewIsolationPolicy(paths: ReviewIsolationPaths, platform = process.platform): string {
  if (platform !== 'darwin') throw new Error('OAR_REVIEW_ISOLATION_UNSUPPORTED_PLATFORM');
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
  const native = (paths.nativeStateDirectories ?? []).map(canonicalStateDirectory);
  const files = (paths.nativeStateFiles ?? []).map(canonicalStateFile);
  for (const state of [...native, ...files]) for (const authority of [paths.subject, ...protectedEntries, paths.output].map(path => realpathSync(path))) {
    if (inside(state, authority) || inside(authority, state)) throw new Error('OAR_REVIEW_NATIVE_STATE_OVERLAPS_AUTHORITY');
  }
  // Only measured pure-state directories may enter the owner-admitted profile.
  // Definitions, trust, settings/hooks and credentials stay denied even inside
  // an otherwise writable tree. This never opens HOME or native config roots.
  const forbiddenFiles = '/(CLAUDE\\.md|AGENTS\\.md|settings[^/]*\\.json|\\.claude\\.json|config\\.toml|auth\\.json|\\.?credentials\\.json|secrets\\.json|token\\.json)$';
  const forbiddenDirectories = '/(\\.?hooks|\\.?agents|\\.?skills|\\.?rules|\\.?plugins)(/|$)';
  const exceptions = [...[output, ...native].map(path => `(require-not (subpath ${JSON.stringify(path)}))`),
    ...files.map(path => `(require-not (literal ${JSON.stringify(path)}))`)].join(' ');
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
