import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { lstatSync, readFileSync, readlinkSync } from 'fs';
import { join } from 'path';

// Raised from 4 MiB: a diff that overflows this cap can no longer be observed,
// so instead of collapsing distinct contents to one fixed hash we mark the
// fingerprint degraded and fail closed (status: unknown).
const PATCH_HASH_MAX_BUFFER = 64 * 1024 * 1024;
// Untracked files up to this size are content-hashed; above it the content
// cannot be fully observed, so the fingerprint is marked degraded (fail-closed)
// rather than silently recording metadata only.
const UNTRACKED_HASH_MAX_BYTES = 64 * 1024 * 1024;

export interface DiffFingerprintInput {
  readonly repoRoot: string;
  readonly baseRef?: string;
  readonly paths: readonly string[];
  readonly policyVersion: number;
  readonly purpose?: string;
}

export interface DiffFingerprint {
  readonly base_ref: string;
  readonly base_rev: string;
  readonly paths: readonly string[];
  readonly staged_diff_hash: string;
  readonly unstaged_diff_hash: string;
  readonly status_hash: string;
  readonly untracked_hash: string;
  readonly fingerprint: string;
}

export const IMPLEMENTATION_FINGERPRINT_SCOPE = 'branch+staged+unstaged+untracked';

export interface ImplementationDiffFingerprint {
  readonly version: 1;
  readonly status: 'ok' | 'unknown';
  readonly scope: typeof IMPLEMENTATION_FINGERPRINT_SCOPE;
  readonly base_ref: string;
  readonly base_rev: string;
  readonly head_rev: string;
  readonly paths: readonly string[];
  readonly excluded_paths: readonly string[];
  readonly branch_diff_hash: string;
  readonly staged_diff_hash: string;
  readonly unstaged_diff_hash: string;
  readonly status_hash: string;
  readonly untracked_hash: string;
  readonly fingerprint: string;
  readonly reason?: string;
}

export interface ReviewFingerprintCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

// Accumulates whether any git observation failed during a single fingerprint
// computation. A degraded computation must fail closed (status: unknown) so the
// Done gate never accepts a review against a diff it could not fully read.
interface FingerprintCtx {
  degraded: boolean;
}

interface GitTextResult {
  readonly ok: boolean;
  readonly text: string;
}

interface GitBufferResult {
  readonly ok: boolean;
  readonly buf: Buffer;
}

export function byteCompare(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a), Buffer.from(b));
}

export function uniqueSorted(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort(byteCompare);
}

// Returns ok:false on any git failure (non-zero exit, maxBuffer overflow, git
// missing) so callers can distinguish a legitimately empty result from an
// unobservable one. The previous helper returned '' for both, which let command
// failures masquerade as clean state.
// --literal-pathspecs: every path handed back to git here was discovered from
// git's own `-z` output, so it must be matched verbatim. Without this flag a
// filename that looks like pathspec magic (a leading `:`, e.g. `:(icase)x`) is
// re-interpreted as a pattern, silently matching a different file or nothing and
// dropping its content from the fingerprint.
function gitRun(repoRoot: string, args: readonly string[], maxBuffer = PATCH_HASH_MAX_BUFFER): GitTextResult {
  try {
    const text = execFileSync('git', ['-C', repoRoot, '--literal-pathspecs', ...args], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer,
    });
    return { ok: true, text };
  } catch {
    return { ok: false, text: '' };
  }
}

// Byte-exact variant for NUL-delimited (`-z`) output so non-ASCII, quoted, or
// whitespace-bearing pathnames survive verbatim instead of being mangled by
// line/space splitting.
function gitRunBuffer(repoRoot: string, args: readonly string[], maxBuffer = PATCH_HASH_MAX_BUFFER): GitBufferResult {
  try {
    const out = execFileSync('git', ['-C', repoRoot, '--literal-pathspecs', ...args], {
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer,
    });
    return { ok: true, buf: Buffer.isBuffer(out) ? out : Buffer.from(String(out)) };
  } catch {
    return { ok: false, buf: Buffer.alloc(0) };
  }
}

function hashText(text: string): string {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

function hashUnknown(label: string): string {
  return hashText(`repo-harness:${label}:unavailable`);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort(byteCompare)
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

function hashJson(value: unknown): string {
  return hashText(stableJson(value));
}

// A successful, genuinely empty patch hashes to hashText('') — distinct from a
// command failure, which marks ctx.degraded and returns hashUnknown(label).
function hashGitPatch(repoRoot: string, args: readonly string[], label: string, ctx: FingerprintCtx): string {
  const res = gitRun(repoRoot, args, PATCH_HASH_MAX_BUFFER);
  if (!res.ok) {
    ctx.degraded = true;
    return hashUnknown(label);
  }
  return hashText(res.text);
}

function hashEmptyGitPatch(): string {
  return hashText('');
}

// Split a NUL-delimited git buffer into verbatim utf-8 tokens. When ctx is
// provided, a token whose bytes do not round-trip through utf-8 marks the
// computation degraded: such a pathname cannot be passed back to the
// string-based git/fs calls without corruption, and two distinct non-utf-8 names
// can decode to the same replacement-character string, so fail closed instead of
// risking a silent collision. (Exported for unit testing.)
export function splitNul(buf: Buffer, ctx?: FingerprintCtx): string[] {
  const parts: string[] = [];
  let start = 0;
  const push = (from: number, to: number): void => {
    const token = buf.toString('utf-8', from, to);
    if (ctx && !Buffer.from(token, 'utf-8').equals(buf.subarray(from, to))) {
      ctx.degraded = true;
    }
    parts.push(token);
  };
  for (let index = 0; index < buf.length; index += 1) {
    if (buf[index] === 0) {
      if (index > start) push(start, index);
      start = index + 1;
    }
  }
  if (start < buf.length) push(start, buf.length);
  return parts;
}

function untrackedContentHash(repoRoot: string, paths: readonly string[], ctx: FingerprintCtx): string {
  const entries: Array<Record<string, unknown>> = [];
  for (const path of paths) {
    const statusRes = gitRun(repoRoot, ['status', '--porcelain=v1', '-z', '--', path]);
    if (!statusRes.ok) {
      ctx.degraded = true;
      continue;
    }
    if (!statusRes.text.split('\0').some((token) => token.startsWith('?? '))) continue;

    const absolute = join(repoRoot, path);
    try {
      // lstat, never stat: an untracked symlink must be fingerprinted by its own
      // target and type, not by the content it points at. statSync would follow
      // the link and miss a retarget to a same-content file, and existsSync would
      // skip a dangling symlink entirely.
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        // Hash the raw link-target bytes (hex): a symlink target is an arbitrary
        // byte string, and the default utf-8 decode of readlinkSync would collapse
        // two distinct non-utf-8 targets to the same replacement string — a
        // fingerprint collision. Hex is lossless, so any retarget changes the hash.
        entries.push({ path, type: 'symlink', target_hex: readlinkSync(absolute, { encoding: 'buffer' }).toString('hex') });
        continue;
      }
      if (!stat.isFile()) {
        // Directory, socket, fifo, gitlink, etc.: its content cannot be modelled
        // as a blob, so fail closed rather than silently ignore it.
        ctx.degraded = true;
        entries.push({ path, type: 'other' });
        continue;
      }
      if (stat.size > UNTRACKED_HASH_MAX_BYTES) {
        // Cannot fully observe the content of an oversized untracked file.
        ctx.degraded = true;
        entries.push({ path, type: 'file', oversized: true, size: stat.size });
        continue;
      }
      entries.push({
        path,
        type: 'file',
        // The executable bit becomes the committed blob mode (100755 vs 100644),
        // so a chmod with no content change is a real implementation diff.
        executable: (stat.mode & 0o111) !== 0,
        sha256: createHash('sha256').update(readFileSync(absolute)).digest('hex'),
      });
    } catch {
      ctx.degraded = true;
      entries.push({ path, unreadable: true });
    }
  }
  return hashJson(entries);
}

export function buildDiffFingerprint(input: DiffFingerprintInput, ctx: FingerprintCtx = { degraded: false }): DiffFingerprint {
  const baseRef = input.baseRef ?? 'HEAD';
  const paths = uniqueSorted(input.paths);
  const pathspec = ['--', ...paths];
  const baseRevRes = gitRun(input.repoRoot, ['rev-parse', '--verify', baseRef]);
  const baseRev = baseRevRes.text.trim() || baseRef;
  let status = '';
  if (paths.length > 0) {
    const statusRes = gitRun(input.repoRoot, ['status', '--porcelain=v1', '--untracked-files=all', '--', ...paths]);
    if (!statusRes.ok) ctx.degraded = true;
    status = statusRes.text;
  }
  const stagedDiffHash = paths.length > 0
    ? hashGitPatch(
        input.repoRoot,
        ['diff', '--cached', '--no-ext-diff', '--binary', '--find-renames', ...pathspec],
        'staged-diff',
        ctx,
      )
    : hashEmptyGitPatch();
  const unstagedDiffHash = paths.length > 0
    ? hashGitPatch(
        input.repoRoot,
        ['diff', '--no-ext-diff', '--binary', '--find-renames', ...pathspec],
        'unstaged-diff',
        ctx,
      )
    : hashEmptyGitPatch();
  const statusHash = hashText(status);
  const untrackedHash = untrackedContentHash(input.repoRoot, paths, ctx);

  const fingerprint = hashJson({
    version: 1,
    purpose: input.purpose ?? 'diff',
    base_ref: baseRef,
    base_rev: baseRev,
    paths,
    policy_version: input.policyVersion,
    staged_diff_hash: stagedDiffHash,
    unstaged_diff_hash: unstagedDiffHash,
    status_hash: statusHash,
    untracked_hash: untrackedHash,
  });

  return Object.freeze({
    base_ref: baseRef,
    base_rev: baseRev,
    paths,
    staged_diff_hash: stagedDiffHash,
    unstaged_diff_hash: unstagedDiffHash,
    status_hash: statusHash,
    untracked_hash: untrackedHash,
    fingerprint,
  });
}

// Parse `git status --porcelain=v1 -z`. Each entry is `XY <path>`; rename/copy
// entries are followed by a separate NUL token carrying the source path, which
// must be consumed so it is not mis-read as the next status entry.
function parseStatusZ(tokens: readonly string[]): { all: string[]; untracked: string[] } {
  const all: string[] = [];
  const untracked: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const entry = tokens[index];
    if (!entry || entry.length < 3) continue;
    const xy = entry.slice(0, 2);
    const path = entry.slice(3);
    if (!path) continue;
    all.push(path);
    if (xy === '??') untracked.push(path);
    if (xy[0] === 'R' || xy[0] === 'C' || xy[1] === 'R' || xy[1] === 'C') {
      const source = tokens[index + 1];
      if (source) {
        all.push(source);
        index += 1;
      }
    }
  }
  return { all: uniqueSorted(all), untracked: uniqueSorted(untracked) };
}

// Parse `git diff --name-status --find-renames -z`. Format is `<status>\0<path>`
// per entry; rename/copy entries are `<status>\0<old>\0<new>`.
function parseNameStatusZ(tokens: readonly string[]): string[] {
  const paths: string[] = [];
  let index = 0;
  while (index < tokens.length) {
    const status = tokens[index];
    index += 1;
    if (!status) continue;
    if (status[0] === 'R' || status[0] === 'C') {
      const oldPath = tokens[index];
      const newPath = tokens[index + 1];
      if (oldPath) paths.push(oldPath);
      if (newPath) paths.push(newPath);
      index += 2;
    } else {
      const path = tokens[index];
      if (path) paths.push(path);
      index += 1;
    }
  }
  return uniqueSorted(paths);
}

function isOperationalReviewPath(path: string): boolean {
  return (
    /^tasks\/reviews\/[^/]+\.review\.md$/.test(path) ||
    path === '.ai/harness/active-plan' ||
    path === '.ai/harness/active-worktree' ||
    path === '.ai/harness/events.jsonl' ||
    path.startsWith('.ai/harness/capability-context/') ||
    path.startsWith('.ai/harness/checks/') ||
    path.startsWith('.ai/harness/failures/') ||
    path.startsWith('.ai/harness/handoff/') ||
    path.startsWith('.ai/harness/planning/') ||
    path.startsWith('.ai/harness/runs/') ||
    path.startsWith('.ai/harness/state/') ||
    path === 'evals/harness/reports/profile-comparison.json' ||
    path === 'evals/harness/reports/profile-comparison.md' ||
    path === '.claude/.active-plan' ||
    path === '.claude/.session-id' ||
    path === '.claude/.trace.jsonl' ||
    path.startsWith('.claude/.codegraph-state/')
  );
}

function unknownImplementationFingerprint(
  baseRef: string,
  baseRev: string,
  headRev: string,
  reason: string,
): ImplementationDiffFingerprint {
  return Object.freeze({
    version: 1 as const,
    status: 'unknown' as const,
    scope: IMPLEMENTATION_FINGERPRINT_SCOPE,
    base_ref: baseRef,
    base_rev: baseRev,
    head_rev: headRev,
    paths: [],
    excluded_paths: [],
    branch_diff_hash: hashUnknown('branch-diff'),
    staged_diff_hash: hashUnknown('staged-diff'),
    unstaged_diff_hash: hashUnknown('unstaged-diff'),
    status_hash: hashUnknown('status'),
    untracked_hash: hashUnknown('untracked'),
    fingerprint: 'unknown',
    reason,
  });
}

export function buildImplementationDiffFingerprint(
  repoRoot: string,
  opts: { baseRef?: string } = {},
): ImplementationDiffFingerprint {
  const baseRef = opts.baseRef ?? 'HEAD';
  const ctx: FingerprintCtx = { degraded: false };
  const headRes = gitRun(repoRoot, ['rev-parse', '--verify', 'HEAD']);
  const baseRes = gitRun(repoRoot, ['rev-parse', '--verify', baseRef]);
  const headRev = headRes.text.trim();
  const baseRev = baseRes.text.trim();
  if (!headRes.ok || !baseRes.ok || !headRev || !baseRev) {
    return unknownImplementationFingerprint(
      baseRef,
      baseRev || baseRef,
      headRev || 'unknown',
      'base or HEAD could not be resolved',
    );
  }

  const statusRes = gitRunBuffer(repoRoot, ['status', '--porcelain=v1', '--untracked-files=all', '-z']);
  if (!statusRes.ok) ctx.degraded = true;
  const statusParsed = parseStatusZ(splitNul(statusRes.buf, ctx));

  const branchRes = gitRunBuffer(repoRoot, ['diff', '--name-status', '--find-renames', '-z', `${baseRef}...HEAD`]);
  if (!branchRes.ok) ctx.degraded = true;
  const branchPaths = parseNameStatusZ(splitNul(branchRes.buf, ctx));

  const allPaths = uniqueSorted([...branchPaths, ...statusParsed.all]);
  const excludedPaths = allPaths.filter(isOperationalReviewPath);
  const implementationPaths = allPaths.filter((path) => !isOperationalReviewPath(path));
  const diff = buildDiffFingerprint(
    {
      repoRoot,
      baseRef,
      paths: implementationPaths,
      policyVersion: 1,
      purpose: 'implementation-review-freshness',
    },
    ctx,
  );
  const branchDiffHash = implementationPaths.length > 0
    ? hashGitPatch(
        repoRoot,
        [
          'diff',
          '--no-ext-diff',
          '--binary',
          '--find-renames',
          `${baseRef}...HEAD`,
          '--',
          ...implementationPaths,
        ],
        'branch-diff',
        ctx,
      )
    : hashEmptyGitPatch();

  if (ctx.degraded) {
    return unknownImplementationFingerprint(
      diff.base_ref,
      diff.base_rev,
      headRev,
      'implementation diff could not be fully observed',
    );
  }

  const fingerprint = hashJson({
    version: 1,
    purpose: 'implementation-review-freshness',
    scope: IMPLEMENTATION_FINGERPRINT_SCOPE,
    base_ref: diff.base_ref,
    base_rev: diff.base_rev,
    // head_rev is intentionally excluded from the hashed payload: committed
    // implementation content is already captured by branch_diff_hash (base...HEAD
    // over implementation paths). Hashing raw HEAD would make an operational-only
    // commit (review/check artifacts) churn the fingerprint and falsely stale the
    // review.
    paths: diff.paths,
    branch_diff_hash: branchDiffHash,
    staged_diff_hash: diff.staged_diff_hash,
    unstaged_diff_hash: diff.unstaged_diff_hash,
    status_hash: diff.status_hash,
    untracked_hash: diff.untracked_hash,
  });

  return Object.freeze({
    version: 1 as const,
    status: 'ok' as const,
    scope: IMPLEMENTATION_FINGERPRINT_SCOPE,
    base_ref: diff.base_ref,
    base_rev: diff.base_rev,
    head_rev: headRev,
    paths: diff.paths,
    excluded_paths: excludedPaths,
    branch_diff_hash: branchDiffHash,
    staged_diff_hash: diff.staged_diff_hash,
    unstaged_diff_hash: diff.unstaged_diff_hash,
    status_hash: diff.status_hash,
    untracked_hash: diff.untracked_hash,
    fingerprint,
  });
}

function reviewFingerprintUsage(): ReviewFingerprintCliResult {
  return {
    exitCode: 0,
    stdout: '',
    stderr: 'repo-harness-hook review-fingerprint [--base <ref>] [--format json]\n',
  };
}

function argValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

export function runReviewFingerprintCli(
  argv: readonly string[],
  opts: { cwd?: string } = {},
): ReviewFingerprintCliResult {
  const allowed = new Set(['--base', '--format']);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!allowed.has(arg)) return reviewFingerprintUsage();
    index += 1;
    if (index >= argv.length) return reviewFingerprintUsage();
  }

  const format = argValue(argv, '--format') ?? 'json';
  if (format !== 'json') return reviewFingerprintUsage();

  // The runtime (workflow_current_review_fingerprint_json) passes the resolved
  // target branch via --base so base_rev tracks the target tip. When --base is
  // absent this falls back to HEAD for direct/diagnostic use only.
  const fingerprint = buildImplementationDiffFingerprint(opts.cwd ?? process.cwd(), {
    baseRef: argValue(argv, '--base') ?? 'HEAD',
  });
  return {
    exitCode: 0,
    stdout: `${JSON.stringify(fingerprint)}\n`,
    stderr: '',
  };
}
