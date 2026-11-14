import { lstatSync, realpathSync, mkdirSync, existsSync, readFileSync, openSync, closeSync, constants, fstatSync, writeFileSync, fsyncSync, unlinkSync, symlinkSync, readlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { isAbsolute, relative, sep, join, dirname } from 'node:path';
import { piAgentDir } from '../pi-agent-dir';
import type { PiModelIdentity } from '../pi-host-probe';
import { OPERATOR_DEFAULT_PORT } from '../../core/review/operator-console-port';
import { shellQuote } from '../../core/shell-quote';
import type { ReviewIsolationAdmission, ReviewIsolationPaths } from '../../core/review/runner-port';


/**
 * `model` is the canonical `provider/model` from pi's resolver; the review passes it to pi as `--model`.
 * `assertCredentialWindow` repeats the admission check against the same round deadline.
 */
export interface PiAgentDirectory {
  readonly directory: string; readonly loopbackPorts: readonly number[]; readonly model: string;
  readonly assertCredentialWindow: () => void;
}

/** pi-ai refreshes an OAuth token that has less than 5 minutes left (auth/resolve.js DEFAULT_OAUTH_MINIMUM_VALIDITY_MS). */
const PI_OAUTH_REFRESH_MARGIN_MS = 300_000;

const MODEL_URL_DEFAULT_PORTS: Readonly<Record<string, number>> = { 'http:': 80, 'https:': 443 };
const LOOPBACK_MODEL_HOSTS: readonly string[] = ['127.0.0.1', 'localhost', '[::1]'];

/**
 * The loopback ports that models.json names as a provider baseUrl (M82). The
 * review profile allows these ports and no other, so a provider on the console
 * port would reopen the write routes and refuses the session. A remote provider
 * needs no rule.
 */
function piModelLoopbackPorts(bytes: Buffer): readonly number[] {
  let providers: Record<string, { readonly baseUrl?: unknown } | null> | null | undefined;
  try { providers = JSON.parse(bytes.toString('utf8'))?.providers; } catch { throw new Error('review_pi_models_invalid'); }
  const ports = new Set<number>();
  for (const provider of Object.values(providers ?? {})) {
    const baseUrl = provider?.baseUrl;
    if (baseUrl === undefined) continue;
    if (typeof baseUrl !== 'string' || !URL.canParse(baseUrl)) throw new Error('review_pi_model_base_url_invalid');
    const url = new URL(baseUrl), defaultPort = MODEL_URL_DEFAULT_PORTS[url.protocol];
    // "127.0.0.1:3425/v1" parses with the scheme "127.0.0.1:", so the scheme check also refuses a missing scheme.
    if (defaultPort === undefined) throw new Error('review_pi_model_base_url_invalid');
    if (!LOOPBACK_MODEL_HOSTS.includes(url.hostname)) continue;
    const port = url.port === '' ? defaultPort : Number(url.port);
    if (port === OPERATOR_DEFAULT_PORT) throw new Error('review_pi_model_port_is_operator_console');
    ports.add(port);
  }
  return [...ports];
}

/**
 * Credentials stay at their source. Only the native model defaults are projected into private settings.
 * Without an explicit model pi falls through to the first provider with auth, so the native
 * settings must name the provider and model in the canonical form that pi's own resolver
 * returns, and auth.json must hold an entry for that provider. pi refreshes the provider's
 * OAuth token when it has less than the refresh margin left, and the sandbox denies the
 * refresh, so the token must outlive the round deadline plus that margin.
 */
export function preparePiAgentDirectory(output: string, sourceHome: string, deadline: number,
  resolveModel: (agentDirectory: string, reference: string) => PiModelIdentity,
  env: Readonly<Record<string, string | undefined>> = process.env): PiAgentDirectory {
  const directory = join(ownedOutput(output), '.pi-agent');
  try { mkdirSync(directory, { mode: 0o700 }); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.()
    || (stat.mode & 0o777) !== 0o700) throw new Error('review_pi_agent_directory_unsafe');
  const source = piAgentDir(realpathSync(sourceHome), env);
  for (const path of [dirname(source), source]) {
    if (existsSync(path) && (lstatSync(path).isSymbolicLink() || !lstatSync(path).isDirectory())) throw new Error('review_pi_source_unsafe');
  }
  const models = join(source, 'models.json'), destination = join(directory, 'models.json');
  let loopbackPorts: readonly number[] = [];
  if (existsSync(models)) {
    const bytes = readNativeConfigBytes(models);
    try { loopbackPorts = piModelLoopbackPorts(bytes); } finally { bytes.fill(0); }
    if (!existsSync(destination)) symlinkSync(models, destination);
    if (!lstatSync(destination).isSymbolicLink() || readlinkSync(destination) !== models) throw new Error('review_pi_models_changed');
  } else if (existsSync(destination)) throw new Error('review_pi_models_changed');
  const settings = preparePiSettings(directory, source), settingsPath = join(source, 'settings.json');
  const provider = settings.defaultProvider, model = settings.defaultModel;
  if (typeof provider !== 'string' || provider === '' || typeof model !== 'string' || model === '') {
    throw new Error(`review_pi_model_unnamed: set defaultProvider and defaultModel in ${settingsPath}`);
  }
  const resolved = resolveModel(directory, `${provider}/${model}`);
  if (resolved.provider !== provider || resolved.model !== model) {
    throw new Error(`review_pi_model_not_canonical: pi resolves ${provider}/${model} to ${resolved.provider}/${resolved.model}; set defaultProvider and defaultModel in ${settingsPath} to that form`);
  }
  const auth = join(source, 'auth.json'), link = join(directory, 'auth.json');
  const renew = `run pi outside the review and enter /login ${provider}`;
  // The deadline does not move, so a startup delay past it would leave the token inside pi's refresh margin.
  const assertCredentialWindow = () => {
    if (Date.now() >= deadline) throw new Error('review_round_deadline_passed: the round deadline passed before the pi session start; repeat the round');
    if (!existsSync(auth)) throw new Error(`review_pi_auth_missing: ${auth} does not exist; ${renew}`);
    const bytes = readNativeConfigBytes(auth);
    try { assertAccessWindow([piAuthExpiry(bytes, provider, renew)], deadline + PI_OAUTH_REFRESH_MARGIN_MS, `${renew} to renew the ${provider} token`); }
    finally { bytes.fill(0); }
  };
  assertCredentialWindow();
  if (!existsSync(link)) symlinkSync(auth, link);
  if (!lstatSync(link).isSymbolicLink() || readlinkSync(link) !== auth) throw new Error('review_pi_auth_changed');
  return { directory, loopbackPorts, model: `${provider}/${model}`, assertCredentialWindow };
}

function preparePiSettings(directory: string, source: string): Readonly<Record<string, unknown>> {
  const native = join(source, 'settings.json'), destination = join(directory, 'settings.json');
  let settings: Record<string, unknown> = {};
  if (existsSync(native)) {
    const bytes = readNativeConfigBytes(native);
    try {
      const parsed: unknown = JSON.parse(bytes.toString('utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      settings = parsed as Record<string, unknown>;
    } catch { throw new Error('review_pi_settings_source_invalid'); }
    finally { bytes.fill(0); }
  }
  const projection = Object.fromEntries(['defaultProvider', 'defaultModel', 'defaultThinkingLevel']
    .filter(key => Object.hasOwn(settings, key)).map(key => [key, settings[key]]));
  const content = JSON.stringify(projection) + '\n';
  if (!existsSync(destination)) writeFileSync(destination, content, { flag: 'wx', mode: 0o600 });
  const stat = lstatSync(destination);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o600
    || readFileSync(destination, 'utf8') !== content) throw new Error('review_pi_settings_changed');
  return projection;
}

/** Unlink only output-local configuration references. Never follow links. */
export function removePiCredentialReferences(output: string): { status: 'removed' | 'absent' | 'cleanup_pending' } {
  try {
    const directory = join(ownedOutput(output), '.pi-agent');
    let stat;
    try { stat = lstatSync(directory); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { status: 'absent' };
      throw error;
    }
    if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(directory) !== directory) return { status: 'cleanup_pending' };
    let removed = false, pending = false;
    for (const name of ['models.json', 'settings.json', 'auth.json']) {
      try { unlinkSync(join(directory, name)); removed = true; } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') pending = true;
      }
    }
    return { status: pending ? 'cleanup_pending' : removed ? 'removed' : 'absent' };
  } catch { return { status: 'cleanup_pending' }; }
}

export function inside(path: string, directory: string): boolean {
  const rest = relative(directory, path);
  return rest === '' || (!isAbsolute(rest) && rest !== '..' && !rest.startsWith(`..${sep}`));
}

function ownedOutput(output: string): string {
  if (!isAbsolute(output) || lstatSync(output).isSymbolicLink() || !lstatSync(output).isDirectory()) throw new Error('review_output_unsafe');
  return realpathSync(output);
}
/** A credential expiry in epoch milliseconds, or 'none' for a credential that does not expire (an API key). */
type CredentialExpiry = number | 'none';

/** The one run-window rule: a sandboxed run cannot refresh a credential, so each one must outlive `until` (epoch ms). */
function assertAccessWindow(expiries: readonly CredentialExpiry[], until: number, renew?: string): void {
  const now = Date.now();
  if (!Number.isSafeInteger(until) || until <= now) throw new Error('review_auth_window_invalid');
  if (expiries.some(expiry => expiry !== 'none' && expiry <= until)) {
    throw new Error(`review_access_expires_within_run${renew ? `; the token must stay valid for ${Math.ceil((until - now) / 60_000)} minutes; ${renew}` : ''}`);
  }
}
/** Codex auth.json: the access token JWT carries the expiry in seconds. */
function codexAuthExpiry(bytes: Buffer): CredentialExpiry[] {
  let exp: unknown;
  try {
    const token = JSON.parse(bytes.toString('utf8')).tokens?.access_token;
    if (typeof token !== 'string') throw new Error();
    exp = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')).exp;
  } catch { throw new Error('review_access_exp_unverified'); }
  if (typeof exp !== 'number' || !Number.isFinite(exp)) throw new Error('review_access_exp_unverified');
  return [exp * 1000];
}
/**
 * pi auth.json: a provider map of `api_key` entries (no expiry) and `oauth`
 * entries (`expires` in epoch milliseconds). The run passes one canonical
 * provider to pi, so only its entry counts, and the entry must exist. Another
 * shape fails closed.
 */
function piAuthExpiry(bytes: Buffer, provider: string, renew: string): CredentialExpiry {
  let entries: unknown;
  try { entries = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('review_pi_auth_shape_unknown'); }
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw new Error('review_pi_auth_shape_unknown');
  const map = entries as Record<string, unknown>;
  if (!Object.hasOwn(map, provider)) throw new Error(`review_pi_auth_missing: auth.json has no ${provider} entry; ${renew}`);
  const entry = map[provider] as { type?: unknown; expires?: unknown } | null;
  if (entry?.type === 'api_key') return 'none';
  if (entry?.type === 'oauth' && typeof entry.expires === 'number' && Number.isFinite(entry.expires)) return entry.expires;
  throw new Error(`review_pi_auth_shape_unknown: provider ${JSON.stringify(provider)}`);
}
/** One bounded read of a native credential or configuration file (auth.json, models.json, settings.json); never follows a link. */
function readNativeConfigBytes(path: string): Buffer {
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
      const bytes = readNativeConfigBytes(destination);
      try { assertAccessWindow(codexAuthExpiry(bytes), Date.now() + runWindowMs); } finally { bytes.fill(0); }
      return { home, auth_copied: true, mode: '0600' };
    }
    const sourceDirectory = join(realpathSync(sourceHome), '.codex');
    if (lstatSync(sourceDirectory).isSymbolicLink() || !lstatSync(sourceDirectory).isDirectory()) throw new Error('review_auth_source_unsafe');
    const bytes = readNativeConfigBytes(join(sourceDirectory, 'auth.json'));
    let fd: number | undefined; let created = false;
    try {
      assertAccessWindow(codexAuthExpiry(bytes), Date.now() + runWindowMs);
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

/**
 * The cleanup investigation (#1721) adds one rule to the review profile: the
 * agent cannot read the target worktrees and their Git directories, so it
 * judges only from the server manifest (M69). Other callers leave the field out.
 * The host derives the policy from these same paths, so the field travels in
 * the host spec.
 */
export type CleanupReviewIsolationPaths = ReviewIsolationPaths & { readonly cleanup?: { readonly readDenied: readonly string[] } };

// Seatbelt has no operation name for utimes, so the allow covers every write
// to a directory at the lock path and these operations are denied again.
const PI_AUTH_LOCK_DENIED = 'file-write-acl file-write-data file-write-finderinfo file-write-flags file-write-mode file-write-owner file-write-setugid file-write-xattr';

/**
 * pi locks the resolved auth.json (pi #11655): proper-lockfile creates, touches
 * and removes the directory `<native auth.json>.lock` beside the native file.
 * The rule opens only those three operations on that literal directory path.
 */
function piAuthLockPolicy(directory: string): string {
  const auth = join(directory, 'auth.json');
  if (!lstatSync(auth).isSymbolicLink()) throw new Error('review_pi_auth_changed');
  const lock = JSON.stringify(`${realpathSync(auth)}.lock`);
  return `(allow file-write* (require-all (literal ${lock}) (vnode-type DIRECTORY)))\n(deny ${PI_AUTH_LOCK_DENIED} (literal ${lock}))\n`;
}

/** Seatbelt owns enforcement. This emits OS policy, never vendor CLI arguments. */
export function reviewIsolationPolicy(paths: CleanupReviewIsolationPaths, platform = process.platform): string {
  if (!isAbsolute(paths.output) || lstatSync(paths.output).isSymbolicLink() || !lstatSync(paths.output).isDirectory()) {
    throw new Error('OAR_REVIEW_OUTPUT_UNSAFE');
  }
  const output = realpathSync(paths.output);
  let piPolicy = '';
  if (paths.piAgentDirectory !== undefined) {
    const directory = paths.piAgentDirectory;
    const stat = lstatSync(directory);
    if (directory !== join(output, '.pi-agent') || stat.isSymbolicLink() || !stat.isDirectory()
      || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o700) throw new Error('review_pi_agent_directory_unsafe');
    piPolicy = `(deny file-write* (literal ${JSON.stringify(join(directory, 'models.json'))}))\n${piAuthLockPolicy(directory)}`;
  }
  const readDenied = paths.cleanup?.readDenied ?? [];
  const protectedEntries = [paths.primary, paths.ownerRecord, paths.journal, paths.gitCommonDir, ...readDenied];
  for (const path of [paths.subject, ...protectedEntries]) {
    if (!isAbsolute(path)) throw new Error('OAR_REVIEW_PROTECTED_PATH_UNSAFE');
    const canonical = realpathSync(path);
    if (inside(canonical, output) || protectedEntries.includes(path) && inside(output, canonical)) {
      throw new Error('OAR_REVIEW_OUTPUT_OVERLAPS_AUTHORITY');
    }
  }
  // Seatbelt matches resolved paths, so a link would leave its target readable.
  if (readDenied.some(path => realpathSync(path) !== path)) throw new Error('OAR_REVIEW_PROTECTED_PATH_UNSAFE');
  // Every review agent is denied the operator console routes (#1770, M82).
  // Seatbelt "localhost" also matches this host's own addresses. A tcp "localhost"
  // rule lets ::ffff:127.0.0.1 through, so IPv6 TCP is denied whole; remote IPv4 stays open.
  const networkPolicy = '(deny network-outbound (remote tcp4 "localhost:*"))\n(deny network-outbound (remote tcp6 "*:*"))\n';
  // The last matching rule wins, so each allow follows the deny. A "localhost"
  // baseUrl can resolve to either family, so the allow names tcp, not tcp4.
  const modelPortPolicy = (paths.piLoopbackPorts ?? []).map(port => `(allow network-outbound (remote tcp "localhost:${port}"))\n`).join('');
  const readPolicy = readDenied.map(path => `(deny file-read* (subpath ${JSON.stringify(path)}))\n`).join('');
  if (platform !== 'darwin') throw new Error('OAR_REVIEW_ISOLATION_UNSUPPORTED_PLATFORM');
  // Output alone is writable; every real CODEX_HOME state grant is retired.
  // Definitions, trust, settings/hooks and credentials stay denied even inside
  // an otherwise writable tree. The one native path that opens is pi's
  // auth.json lock directory (piAuthLockPolicy); nothing else in HOME or a
  // native config root opens.
  const forbiddenFiles = '/(CLAUDE\\.md|AGENTS\\.md|settings[^/]*\\.json|\\.claude\\.json|config\\.toml|auth\\.json|\\.?credentials\\.json|secrets\\.json|token\\.json)$';
  const forbiddenDirectories = '/(\\.?hooks|\\.?agents|\\.?skills|\\.?rules|\\.?plugins)(/|$)';
  const exceptions = `(require-not (subpath ${JSON.stringify(output)}))`;
  // macOS resolves DNS through this system socket. Other local services remain denied.
  const unixSockets = '(require-all (remote unix-socket) (require-not (remote unix-socket (path-literal "/private/var/run/mDNSResponder"))))';
  return `(version 1)\n(allow default)\n(deny file-write* (require-all ${exceptions} (require-not (literal "/dev/null"))))\n(deny file-write* (regex #"${forbiddenFiles}"))\n(deny file-write* (regex #"${forbiddenDirectories}"))\n(deny signal)\n(deny network-outbound ${unixSockets})\n${piPolicy}${networkPolicy}${modelPortPolicy}${readPolicy}`;

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

/** Immutable executable seam: OAR owns every vendor argument and wire protocol. */
export function prepareReviewLauncher(directory: string, policyFile: string, executable: string): string {
  const policy = realpathSync(policyFile), vendor = realpathSync(executable), owner = realpathSync(directory);
  if (!isAbsolute(directory) || owner !== directory || !lstatSync(owner).isDirectory()
    || lstatSync(policyFile).isSymbolicLink() || !lstatSync(policy).isFile()
    || !lstatSync(vendor).isFile()) throw new Error('OAR_REVIEW_LAUNCHER_UNSAFE');
  const content = `#!/bin/sh\nexec /usr/bin/sandbox-exec -f ${shellQuote(policy)} ${shellQuote(vendor)} "$@"\n`;
  const launcher = join(owner, 'reviewer-launcher');
  if (!existsSync(launcher)) writeFileSync(launcher, content, { flag: 'wx', mode: 0o700 });
  const stat = lstatSync(launcher);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o700
    || readFileSync(launcher, 'utf8') !== content) throw new Error('OAR_REVIEW_LAUNCHER_CHANGED');
  return launcher;
}

/** Trusted host alone writes control evidence; only OAR's child is sandboxed. */
export function reviewHostCommand(node: string, hostEntry: string, specFile: string): readonly string[] {
  for (const path of [node, hostEntry, specFile]) if (!isAbsolute(path)) throw new Error('OAR_REVIEW_HOST_PATH_UNSAFE');
  return [node, '--disable-sigusr1', hostEntry, specFile];
}
