import { closeSync, constants, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, readlinkSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { isAbsolute, join, posix } from 'node:path';
import { inside, prepareCodexHome } from './review-isolation';
import type { ModelApiEndpoint } from './docs-host-proxy';

/** Runtimes whose boundary has a zero-model proof. Claude keeps its macOS login in the Keychain, which this host denies. */
export type DocsHostRuntime = 'codex';

/** Model API hosts per runtime. The access token is checked for the whole run, so no auth refresh host is open. */
export const DOCS_HOST_MODEL_API: Readonly<Record<DocsHostRuntime, readonly ModelApiEndpoint[]>> = {
  codex: [{ host: 'chatgpt.com', port: 443 }, { host: 'api.openai.com', port: 443 }],
};

export const DOCS_HOST_PROJECTION_MANIFEST = 'docs/architecture/.projection-manifest.json';

/**
 * Programs a docs session may start: a shell and text tools. No network
 * client, no app launcher, no keychain tool. Git is the real developer binary
 * through `<control>/bin/git`; the `/usr/bin/git` shim needs xcodebuild in a
 * fresh environment, and git-core helpers (remote transports, credential
 * helpers, receive-pack) stay unlisted, so a push cannot start.
 */
export const DOCS_HOST_SYSTEM_PROGRAMS: readonly string[] = [
  '/bin/sh', '/bin/bash', '/bin/zsh', '/bin/[', '/bin/cat', '/bin/cp', '/bin/date', '/bin/echo', '/bin/ls', '/bin/mkdir', '/bin/mv',
  '/bin/pwd', '/bin/realpath', '/bin/rm', '/bin/rmdir', '/bin/test',
  '/usr/bin/awk', '/usr/bin/basename', '/usr/bin/cut', '/usr/bin/diff', '/usr/bin/dirname', '/usr/bin/env', '/usr/bin/false',
  '/usr/bin/find', '/usr/bin/grep', '/usr/bin/head', '/usr/bin/sed', '/usr/bin/sort', '/usr/bin/tail',
  '/usr/bin/touch', '/usr/bin/tr', '/usr/bin/true', '/usr/bin/uniq', '/usr/bin/wc', '/usr/bin/which', '/usr/bin/xargs',
];

/** Credential stores under the operator HOME. Reads are denied; the session never sees the operator HOME as its own. */
const CREDENTIAL_SUBPATHS = ['.codex', '.claude', '.config/gh', '.config/git', '.ssh', '.aws', '.gnupg', '.docker', '.kube', '.azure', '.config/gcloud', 'Library/Keychains'];
const CREDENTIAL_LITERALS = ['.claude.json', '.netrc', '.git-credentials', '.npmrc', '.repo-harness/mcp.tokens.json'];
const CREDENTIAL_FILES = '/(auth\\.json|\\.?credentials\\.json|secrets\\.json|token\\.json|mcp\\.tokens\\.json|\\.env(rc|\\.[^/]+)?)$';
const FORBIDDEN_WRITE_FILES = '/(CLAUDE\\.md|AGENTS\\.md|settings[^/]*\\.json|\\.claude\\.json|config\\.toml|auth\\.json|\\.?credentials\\.json|secrets\\.json|token\\.json|\\.env(rc|\\.[^/]+)?|\\.git)$';
const FORBIDDEN_WRITE_DIRECTORIES = '/(\\.?hooks|\\.?agents|\\.?skills|\\.?rules|\\.?plugins|\\.?commands|\\.?prompts|\\.git)(/|$)';
const KEYCHAIN_SERVICES = ['com.apple.SecurityServer', 'com.apple.securityd', 'com.apple.securityd.xpc'];
const DESKTOP_SERVICES = [
  'com.apple.coreservices.launchservicesd', 'com.apple.lsd.mapdb', 'com.apple.lsd.modifydb',
  // LaunchServices opens apps and URLs through these two (Apple frameworks.sb lists them for LaunchServices.framework).
  'com.apple.lsd.open', 'com.apple.lsd.openurl',
  'com.apple.coreservices.appleevents', 'com.apple.pasteboard.1',
  // Second pasteboard endpoint, published by com.apple.pboard.plist.
  'com.apple.coreservices.uauseractivitypasteboardclient.xpc',
];

/** Operator input. A session request cannot supply or change it. */
export interface DocsHostAdmission {
  readonly runtime: DocsHostRuntime;
  /** Canonical linked worktree root. */
  readonly worktree: string;
  /** Owner-only directory outside the worktree. It holds the profile; only its `scratch` child is writable. */
  readonly control: string;
  /** Operator HOME: the model credential source and the root of denied credential reads. */
  readonly operatorHome: string;
  readonly node: string;
  readonly executable: string;
  /** Canonical Xcode or Command Line Tools root that `/usr/bin/git` dispatches to. */
  readonly developerDirectory: string;
  readonly proxyPort: number;
}

export interface DocsHostScratch {
  readonly root: string;
  readonly home: string;
  readonly codexHome: string;
  readonly claudeConfigDir: string;
  readonly tmp: string;
  /** Owner-only, not writable by the session: first on PATH. */
  readonly bin: string;
}

function canonicalDirectory(path: string, code: string): string {
  if (typeof path !== 'string' || !isAbsolute(path) || /[\r\n\0"]/.test(path)) throw new Error(code);
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (!stat?.isDirectory() || stat.isSymbolicLink() || realpathSync(path) !== path) throw new Error(code);
  return path;
}

function ownerDirectory(path: string, code: string): string {
  const stat = lstatSync(canonicalDirectory(path, code));
  if (stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o700) throw new Error(code);
  return path;
}

export function assertDocsHostPlatform(platform: NodeJS.Platform = process.platform): void {
  if (platform !== 'darwin') throw new Error('platform_unsupported');
}

/** `/usr/bin/git` is a shim; the real binary lives in the selected developer directory. */
export function docsHostDeveloperDirectory(): string {
  const result = spawnSync('/usr/bin/xcode-select', ['-p'], { encoding: 'utf8', timeout: 5000 });
  if (result.status !== 0) throw new Error('docs_host_developer_directory_unavailable');
  return realpathSync(result.stdout.trim());
}

/**
 * Seatbelt checks the opened path, so a pre-existing hard link inside docs/
 * would carry a write to a protected inode. New links from outside are denied
 * by the live policy; this rejects the old ones before any session exists.
 */
function assertDocsTreeFiles(root: string): void {
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop()!;
    for (const name of readdirSync(directory)) {
      const path = join(directory, name), stat = lstatSync(path);
      if (stat.isSymbolicLink()) continue; // The OS checks the resolved target.
      if (stat.isDirectory()) pending.push(path);
      else if (!stat.isFile()) throw new Error(`docs_host_docs_entry_unsupported: ${path}`);
      else if (stat.nlink !== 1) throw new Error(`docs_host_docs_hardlink_unsupported: ${path}`);
    }
  }
}

/**
 * The manifest path, generated projection targets, and every directory above
 * them inside docs/ (no rename or removal). The manifest path stays protected
 * when the file is absent, so a session cannot create one. Seatbelt checks the
 * resolved path, so a symlink on any protected path would route a write to an
 * open docs/ file; such a symlink fails admission.
 */
export function docsHostProtectedProjection(worktree: string): readonly string[] {
  const protectedPaths = new Set<string>(['docs']);
  const protect = (path: string) => {
    for (let entry = path; entry.startsWith('docs/'); entry = posix.dirname(entry)) {
      if (lstatSync(join(worktree, entry), { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error(`docs_host_projection_symlink_unsupported: ${entry}`);
      protectedPaths.add(entry);
    }
  };
  protect(DOCS_HOST_PROJECTION_MANIFEST);
  const manifestPath = join(worktree, DOCS_HOST_PROJECTION_MANIFEST);
  if (existsSync(manifestPath)) {
    let targets: unknown;
    try { targets = (JSON.parse(readFileSync(manifestPath, 'utf8')) as { targets?: unknown }).targets; }
    catch { throw new Error('docs_host_projection_manifest_invalid'); }
    if (!targets || typeof targets !== 'object' || Array.isArray(targets)) throw new Error('docs_host_projection_manifest_invalid');
    for (const target of Object.values(targets)) {
      const path = (target as { path?: unknown } | null)?.path;
      if (typeof path !== 'string' || path === '' || isAbsolute(path) || posix.normalize(path) !== path || path.startsWith('../') || /[\r\n\0"]/.test(path)) {
        throw new Error('docs_host_projection_manifest_invalid');
      }
      if (path.startsWith('docs/')) protect(path); else protectedPaths.add(path);
    }
  }
  return [...protectedPaths].sort().map(path => join(worktree, path));
}

/** Validate operator input and the worktree before any policy text exists. */
export function assertDocsHostAdmission(admission: DocsHostAdmission, platform: NodeJS.Platform = process.platform): void {
  assertDocsHostPlatform(platform);
  if (admission.runtime !== 'codex') throw new Error('docs_host_runtime_unverified');
  const worktree = canonicalDirectory(admission.worktree, 'docs_host_worktree_unsafe');
  const dotGit = lstatSync(join(worktree, '.git'), { throwIfNoEntry: false });
  if (!dotGit?.isFile()) throw new Error('docs_host_linked_worktree_required');
  const docs = canonicalDirectory(join(worktree, 'docs'), 'docs_host_docs_unsafe');
  const control = ownerDirectory(admission.control, 'docs_host_control_unsafe');
  canonicalDirectory(admission.operatorHome, 'docs_host_operator_home_unsafe');
  canonicalDirectory(admission.developerDirectory, 'docs_host_developer_directory_unsafe');
  if (inside(control, worktree) || inside(worktree, control) || inside(control, docs)) throw new Error('docs_host_control_overlaps_worktree');
  for (const path of [admission.node, admission.executable]) {
    if (typeof path !== 'string' || !isAbsolute(path) || /[\r\n\0"]/.test(path) || !lstatSync(realpathSync(path)).isFile()) throw new Error('docs_host_executable_unsafe');
    // A session must not be able to replace its own runtime.
    if (inside(realpathSync(path), worktree) || inside(realpathSync(path), control)) throw new Error('docs_host_executable_unsafe');
  }
  if (!Number.isSafeInteger(admission.proxyPort) || admission.proxyPort < 1 || admission.proxyPort > 65535) throw new Error('docs_host_proxy_port_invalid');
  assertDocsTreeFiles(docs);
}

const lit = (path: string) => `(literal ${JSON.stringify(path)})`;
const sub = (path: string) => `(subpath ${JSON.stringify(path)})`;

/**
 * Seatbelt owns enforcement. Writes open only for human-written docs and the
 * session scratch; credential reads, every network peer except the host proxy
 * port, keychain and desktop service lookups, AppleEvents and unlisted programs
 * are denied. Children inherit the profile. Last matching rule wins, so each
 * deny follows its allowance.
 */
export function docsHostPolicy(admission: DocsHostAdmission, platform: NodeJS.Platform = process.platform): string {
  assertDocsHostAdmission(admission, platform);
  const docs = join(admission.worktree, 'docs');
  const scratch = join(admission.control, 'scratch');
  const privateAuth = join(scratch, '.codex-home', 'auth.json');
  const home = admission.operatorHome;
  const programs = [...DOCS_HOST_SYSTEM_PROGRAMS, join(admission.developerDirectory, 'usr/bin/git'), realpathSync(admission.node), realpathSync(admission.executable)];
  const projection = docsHostProtectedProjection(admission.worktree);
  return [
    '(version 1)',
    '(allow default)',
    `(deny file-write* (require-all (require-not ${sub(docs)}) (require-not ${sub(scratch)}) (require-not ${lit('/dev/null')})))`,
    `(deny file-write* (regex #"${FORBIDDEN_WRITE_FILES}"))`,
    `(deny file-write* (regex #"${FORBIDDEN_WRITE_DIRECTORIES}"))`,
    `(deny file-write* ${projection.map(lit).join(' ')})`,
    `(deny file-read* ${CREDENTIAL_SUBPATHS.map(path => sub(join(home, path))).join(' ')} ${CREDENTIAL_LITERALS.map(path => lit(join(home, path))).join(' ')})`,
    `(deny file-read* (require-all (regex #"${CREDENTIAL_FILES}") (require-not ${lit(privateAuth)})))`,
    `(deny file-map-executable ${sub(docs)} ${sub(scratch)})`,
    '(deny process-exec)',
    `(allow process-exec ${[...new Set(programs)].map(lit).join(' ')})`,
    `(deny mach-lookup ${KEYCHAIN_SERVICES.map(name => `(global-name ${JSON.stringify(name)})`).join(' ')})`,
    // A native add-on already on disk (koffi) gives node FFI under (allow default),
    // so close what FFI could reach past the profile: AppleEvents to other apps,
    // LaunchServices app and URL opens, and the pasteboard.
    '(deny appleevent-send)',
    `(deny mach-lookup ${DESKTOP_SERVICES.map(name => `(global-name ${JSON.stringify(name)})`).join(' ')})`,
    '(deny network*)',
    `(allow network-outbound (remote ip "localhost:${admission.proxyPort}"))`,
    '(deny signal)',
    '(allow signal (target same-sandbox))',
    '',
  ].join('\n');
}

/** Private HOME, CODEX_HOME, CLAUDE_CONFIG_DIR and TMPDIR, plus the owner bin. Only the model credential is copied in. */
export function prepareDocsHostScratch(admission: DocsHostAdmission, runWindowMs: number, reuse = false): DocsHostScratch {
  const control = ownerDirectory(admission.control, 'docs_host_control_unsafe');
  const root = join(control, 'scratch'), bin = join(control, 'bin');
  const home = join(root, 'home'), claudeConfigDir = join(home, '.claude'), tmp = join(root, 'tmp');
  for (const path of [root, home, claudeConfigDir, tmp, bin]) {
    try { mkdirSync(path, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw new Error('docs_host_scratch_create_failed'); }
    ownerDirectory(path, 'docs_host_scratch_unsafe');
  }
  const git = join(bin, 'git'), target = join(admission.developerDirectory, 'usr/bin/git');
  if (!existsSync(git)) symlinkSync(target, git);
  if (!lstatSync(git).isSymbolicLink() || readlinkSync(git) !== target) throw new Error('docs_host_bin_changed');
  const { home: codexHome } = prepareCodexHome(root, admission.operatorHome, runWindowMs, reuse);
  return { root, home, codexHome, claudeConfigDir, tmp, bin };
}

/**
 * A new environment, never a filtered copy of the host one: no GH_TOKEN, no
 * operator config path, no git credential helper. Every proxy variable points
 * at the host proxy so a runtime reaches its model API through the one port.
 */
export function docsHostEnvironment(scratch: DocsHostScratch, proxyPort: number): Record<string, string> {
  const proxy = `http://127.0.0.1:${proxyPort}`;
  return {
    PATH: `${scratch.bin}:/usr/bin:/bin`,
    HOME: scratch.home,
    CODEX_HOME: scratch.codexHome,
    CLAUDE_CONFIG_DIR: scratch.claudeConfigDir,
    TMPDIR: scratch.tmp,
    SHELL: '/bin/zsh',
    LANG: 'en_US.UTF-8',
    HTTPS_PROXY: proxy, HTTP_PROXY: proxy, ALL_PROXY: proxy, https_proxy: proxy, http_proxy: proxy, all_proxy: proxy,
    NO_PROXY: '', no_proxy: '',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'credential.helper', GIT_CONFIG_VALUE_0: '',
    GIT_TERMINAL_PROMPT: '0',
    GIT_PAGER: 'cat', PAGER: 'cat',
  };
}

/** Owner-only profile file in the control directory; an existing file must match exactly. */
export function writeDocsHostPolicy(admission: DocsHostAdmission): string {
  const content = docsHostPolicy(admission);
  const file = join(admission.control, 'docs-host.sb');
  if (!existsSync(file)) writeFileSync(file, content, { flag: 'wx', mode: 0o600 });
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o600
    || readFileSync(file, 'utf8') !== content) throw new Error('docs_host_profile_changed');
  return file;
}

const PROBE = `const fs=require('node:fs'),net=require('node:net'),cp=require('node:child_process');
const [gitFile,docs,credential,policy,port]=process.argv.slice(1);
const denied=(fn)=>{try{fn();return false}catch(e){return e.code==='EPERM'||e.code==='EACCES'}};
if(!denied(()=>fs.closeSync(fs.openSync(gitFile,fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW))))process.exit(10);
if(!denied(()=>fs.closeSync(fs.openSync(policy,fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW))))process.exit(11);
if(!denied(()=>fs.readFileSync(credential)))process.exit(12);
if(cp.spawnSync('/usr/bin/curl',['--version']).error?.code!=='EPERM')process.exit(13);
const child=cp.spawnSync(process.execPath,['-e',"const fs=require('node:fs');try{fs.closeSync(fs.openSync(process.argv[1],fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW));process.exit(1)}catch(e){process.exit(e.code==='EPERM'?0:1)}",gitFile]);
if(child.status!==0)process.exit(14);
const path=docs+'/.docs-host-probe-'+process.pid;fs.writeFileSync(path,'probe',{flag:'wx'});fs.unlinkSync(path);
const s=net.connect(Number(port)===9?7:9,'127.0.0.1');s.on('connect',()=>process.exit(15));s.on('error',e=>process.exit(e.code==='EPERM'?0:16));`;

/**
 * Zero-model proof before any session opens: a real sandboxed child and
 * grandchild must be denied the worktree .git, the profile, a credential, an
 * unlisted program and a loopback peer, and must still write docs/. Any other
 * outcome fails closed; there is no unconfined fallback.
 */
export function proveDocsHostBoundary(admission: DocsHostAdmission, policyFile: string, scratch: DocsHostScratch): void {
  if (readFileSync(policyFile, 'utf8') !== docsHostPolicy(admission)) throw new Error('docs_host_profile_changed');
  const result = spawnSync('/usr/bin/sandbox-exec', ['-f', policyFile, realpathSync(admission.node), '-e', PROBE,
    join(admission.worktree, '.git'), join(admission.worktree, 'docs'), join(admission.operatorHome, '.codex', 'auth.json'), policyFile, String(admission.proxyPort)],
  { encoding: 'utf8', timeout: 10_000, env: docsHostEnvironment(scratch, admission.proxyPort), cwd: admission.worktree });
  if (result.status !== 0) throw new Error(`docs_host_boundary_unproven: ${result.error?.message ?? `exit ${result.status}`}`);
  // The owner can still open the profile, so the denial above came from Seatbelt, not file mode.
  closeSync(openSync(policyFile, constants.O_WRONLY | constants.O_NOFOLLOW));
}
