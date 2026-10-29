import { createHash, randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, fstatSync, readSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalize } from '../../core/evidence/canonical-json';
import type { JsonValue } from '../../core/evidence/types';
import { containsSecret } from '../../core/security/secret-patterns';
import { cleanupPlanDigestInput, decodeCleanupPlan, type CleanupPlanItem } from '../../core/operator/worktree-cleanup-plan';
import type { CleanupFileEvidence, CleanupLossEvidence } from '../../core/operator/worktree-cleanup-observation';
import { isRepositoryRelativePath } from '../../core/operator/doc-session-events';
import { repoHarnessHome } from '../repo-harness-home';
import { docSessionGitRunner } from './doc-session-changes';
import { cleanupLossSha256 } from './worktree-cleanup-plan';
import { observeCleanupLoss, type CleanupObservationTarget } from './worktree-cleanup-observation';
import { cleanupDirectoryNames, createCleanupPrivateFile, ensureCleanupPrivateDirectory, openCleanupChild, openCleanupDirectory,
  publishCleanupPrivateFile, unlinkCleanupTemporary } from './cleanup-file-access';

export class CleanupArchiveError extends Error {
  constructor(readonly code: 'changed' | 'unsafe_git_content' | 'unsupported' | 'archive_conflict' | 'unavailable') { super(`cleanup_archive_${code}`); }
}
function fail(code: CleanupArchiveError['code']): never { throw new CleanupArchiveError(code); }
const hex = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const PRIVATE_FILE = /(?:^|\/)(?:\.env(?:\.[^/]*)?|\.envrc|auth\.json|\.?credentials(?:\.json)?|secrets?\.json|token\.json|mcp\.tokens\.json|id_(?:rsa|ed25519|ecdsa)|[^/]+\.(?:pem|key|p12|pfx))$/iu;
const GIT_FILE_MAX = 16 * 1024 * 1024;
type Original = { kind: 'file' | 'symlink'; mode: number } | { kind: 'index'; mode: string; stage: number; oid: string }
  | { kind: 'commit'; oid: string; parents: readonly string[] } | { kind: 'manifest' };
interface Artifact {
  readonly storage: 'git' | 'private'; readonly path: string; readonly source: string; readonly sha256: string; readonly size: number;
  readonly original: Original;
}
/** Private effect result. Public responses use only the plan's destination names and the eventual Draft PR link. */
export interface StagedCleanupArchive {
  readonly protocol: 1;
  readonly kind: 'operator_cleanup_archive';
  readonly key: string;
  readonly manifest_sha256: string;
  readonly git_directory: string | null;
  readonly private_directory: string | null;
  readonly artifacts: readonly Artifact[];
}
export interface CleanupArchiveOptions {
  readonly env: NodeJS.ProcessEnv;
  readonly deadline: number;
  /** An existing private server scratch directory outside the source worktree. */
  readonly staging_root: string;
  readonly after_artifact?: (artifact: Artifact) => void;
}
function checkDeadline(deadline: number) { if (Date.now() >= deadline) fail('unavailable'); }
function privateDirectory(path: string): number {
  const fd = openCleanupDirectory(path), stat = fstatSync(fd);
  if (stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0) { closeSync(fd); fail('unavailable'); }
  return fd;
}
function below(parent: number, path: string): number {
  if (!isRepositoryRelativePath(path)) fail('unsupported');
  let current = parent, owned = false;
  try {
    for (const name of path.split('/')) {
      const child = ensureCleanupPrivateDirectory(current, name);
      if (owned) closeSync(current); current = child; owned = true;
    }
    return current;
  } catch (error) { if (owned) closeSync(current); throw error; }
}
function readHash(fd: number, size: number, deadline: number): string {
  const digest = createHash('sha256'), chunk = Buffer.alloc(64 * 1024);
  let offset = 0;
  while (offset < size) {
    checkDeadline(deadline);
    const count = readSync(fd, chunk, 0, Math.min(size - offset, chunk.length), offset);
    if (!count) fail('changed'); digest.update(chunk.subarray(0, count)); offset += count;
  }
  return digest.digest('hex');
}
function checkArtifact(parent: number, name: string, expected: Pick<Artifact, 'sha256' | 'size'>, deadline: number): void {
  const opened = openCleanupChild(parent, name);
  try {
    if (!opened.stat.isFile() || opened.link !== null || opened.stat.uid !== process.getuid?.() || (opened.stat.mode & 0o777) !== 0o600
      || opened.stat.size !== expected.size || readHash(opened.fd, expected.size, deadline) !== expected.sha256) fail('archive_conflict');
  } finally { closeSync(opened.fd); }
}
/** Durable no-overwrite publication. An interrupted temporary cannot masquerade as a completed artifact. */
function artifact(root: number, path: string, expected: Pick<Artifact, 'sha256' | 'size'>, write: (fd: number) => void, deadline: number): void {
  if (!isRepositoryRelativePath(path)) fail('unsupported');
  const parts = path.split('/'), name = parts.pop()!, parent = parts.length ? below(root, parts.join('/')) : root;
  try {
    if (cleanupDirectoryNames(parent).includes(name)) { checkArtifact(parent, name, expected, deadline); return; }
    const temporary = `.partial-${randomUUID()}`, fd = createCleanupPrivateFile(parent, temporary);
    try { write(fd); fsyncSync(fd); if (fstatSync(fd).size !== expected.size) fail('changed'); }
    finally { closeSync(fd); }
    if (!publishCleanupPrivateFile(parent, temporary, name)) checkArtifact(parent, name, expected, deadline);
    fsyncSync(parent);
    unlinkCleanupTemporary(parent, temporary); fsyncSync(parent);
    checkArtifact(parent, name, expected, deadline);
  } finally { if (parent !== root) closeSync(parent); }
}
const writeBytes = (fd: number, bytes: Buffer) => {
  let offset = 0; while (offset < bytes.length) { const written = writeSync(fd, bytes, offset, bytes.length - offset); if (!written) fail('unavailable'); offset += written; }
};
function sourceFile(root: number, path: string): { fd: number; close: () => void } {
  const parts = path.split('/'); if (!isRepositoryRelativePath(path)) fail('unsupported');
  let directory = root, owned = false;
  try {
    for (const part of parts.slice(0, -1)) {
      const child = openCleanupChild(directory, part);
      if (!child.stat.isDirectory()) { closeSync(child.fd); fail('unsupported'); }
      if (owned) closeSync(directory); directory = child.fd; owned = true;
    }
    const child = openCleanupChild(directory, parts[parts.length - 1]!);
    if (!child.stat.isFile() || child.link !== null) { closeSync(child.fd); fail('unsupported'); }
    if (owned) closeSync(directory);
    return { fd: child.fd, close: () => closeSync(child.fd) };
  } catch (error) { if (owned) closeSync(directory); throw error; }
}
function gitSafe(path: string, bytes: Buffer): void {
  if (PRIVATE_FILE.test(path) || bytes.length > GIT_FILE_MAX || bytes.includes(0)) fail('unsafe_git_content');
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return fail('unsafe_git_content'); }
  if (containsSecret(text) || text.includes('GIT binary patch')) fail('unsafe_git_content');
}
function fileBytes(root: number, file: CleanupFileEvidence, deadline: number): Buffer {
  if (file.kind !== 'file' || file.size > GIT_FILE_MAX) fail('unsafe_git_content');
  const source = sourceFile(root, file.path);
  try {
    const bytes = Buffer.alloc(file.size); let offset = 0;
    while (offset < bytes.length) { checkDeadline(deadline); const count = readSync(source.fd, bytes, offset, bytes.length - offset, offset); if (!count) fail('changed'); offset += count; }
    if (fstatSync(source.fd).size !== file.size || hex(bytes) !== file.sha256) fail('changed');
    return bytes;
  } finally { source.close(); }
}

/** Capture approved content into private storage and an unpublished docs artifact tree. Never changes the source. */
export function stageCleanupArchive(sessionId: string, target: CleanupObservationTarget, item: CleanupPlanItem, options: CleanupArchiveOptions): StagedCleanupArchive {
  let source = -1, staging = -1, privateRoot = -1;
  try {
    decodeCleanupPlan({ protocol: 1, kind: 'operator_worktree_cleanup_plan', session_id: sessionId, items: [item] });
    if (hex(cleanupPlanDigestInput(sessionId, item)) !== item.plan_sha256 || target.id !== item.worktree.id
      || item.advice.recommendation !== 'archive_then_delete' || item.worktree.repository_id === null) fail('changed');
    if (options.staging_root === target.worktree || options.staging_root.startsWith(target.worktree + '/')) fail('unsupported');
    const loss = observeCleanupLoss(target, options);
    if (cleanupLossSha256({ worktree: item.worktree, loss }) !== item.loss_sha256) fail('changed');
    const key = `${sessionId}:${target.id}:${item.plan_sha256}`, operation = hex(key);
    source = openCleanupDirectory(target.worktree);
    if (fstatSync(source).dev !== loss.identity.dev || fstatSync(source).ino !== loss.identity.ino) fail('changed');
    const layout = item.advice.archive;
    if (layout.git) { const root = privateDirectory(options.staging_root); try { staging = below(root, `${operation}/${layout.git.directory}`); } finally { closeSync(root); } }
    if (layout.private) {
      const home = openCleanupDirectory(repoHarnessHome(options.env));
      try { privateRoot = below(home, `archive/${item.worktree.repository_id}/${operation}`); } finally { closeSync(home); }
    }
    const artifacts: Artifact[] = [];
    const save = (storage: Artifact['storage'], path: string, origin: string, bytes: Buffer, original: Original) => {
      checkDeadline(options.deadline);
      if (storage === 'git') gitSafe(origin, bytes);
      const record = { storage, path, source: origin, sha256: hex(bytes), size: bytes.length, original };
      artifact(storage === 'git' ? staging : privateRoot, path, record, fd => writeBytes(fd, bytes), options.deadline);
      artifacts.push(record); options.after_artifact?.(record);
    };
    for (const storage of ['git', 'private'] as const) for (const path of layout[storage]?.paths ?? []) {
      if (path === '.git' || path === 'SOURCE.md' || path.startsWith('.cleanup/')) fail('unsupported');
      const file = loss.files.find(file => file.path === path);
      if (file) {
        if (storage === 'git') { if (PRIVATE_FILE.test(path)) fail('unsafe_git_content'); save(storage, path, path, fileBytes(source, file, options.deadline), { kind: 'file', mode: file.mode }); }
        else {
          if (file.kind !== 'file' || file.sha256 === null) fail('unsupported');
          const record = { storage, path, source: path, sha256: file.sha256, size: file.size, original: { kind: 'file' as const, mode: file.mode } };
          const opened = sourceFile(source, path);
          try {
            artifact(privateRoot, path, record, fd => {
              const buffer = Buffer.alloc(64 * 1024), digest = createHash('sha256'); let offset = 0;
              while (offset < file.size) { checkDeadline(options.deadline); const count = readSync(opened.fd, buffer, 0, Math.min(buffer.length, file.size - offset), offset); if (!count) fail('changed');
                const bytes = buffer.subarray(0, count); digest.update(bytes); writeBytes(fd, bytes); offset += count; }
              if (fstatSync(opened.fd).size !== file.size || digest.digest('hex') !== file.sha256) fail('changed');
            }, options.deadline);
          } finally { opened.close(); }
          artifacts.push(record); options.after_artifact?.(record);
        }
      }
      // Preserve index-only versions separately, including unresolved index stages.
      for (const entry of loss.index.filter(entry => entry.path === path)) {
        const bytes = docSessionGitRunner({ ...options.env, GIT_NO_REPLACE_OBJECTS: '1' }).bytes(target.worktree, ['cat-file', 'blob', entry.oid]);
        const oid = createHash(entry.oid.length === 64 ? 'sha256' : 'sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
        if (oid !== entry.oid) fail('changed');
        save(storage, `.cleanup/index/${entry.stage}/${path}`, path, bytes, { kind: 'index', mode: entry.mode, stage: entry.stage, oid });
      }
      if (!file && !loss.index.some(entry => entry.path === path)) fail('changed');
    }
    if (layout.git?.include_commits) stageCommits(target, loss, options, save);
    const manifest = { protocol: 1, kind: 'cleanup_archive_manifest', key, session_id: sessionId, worktree_id: target.id, repository_id: item.worktree.repository_id,
      plan_sha256: item.plan_sha256, loss_sha256: item.loss_sha256, branch: loss.branch, head_commit: loss.head_commit,
      commits: loss.commits, files: artifacts };
    const manifestBytes = Buffer.from(canonicalize(manifest as unknown as JsonValue) + '\n');
    const sourceText = Buffer.from(`# Cleanup archive\n\nRepository: ${item.worktree.repository_id}\nWorktree: ${item.worktree.directory}\nBranch: ${loss.branch ?? 'orphan'}\nHEAD: ${loss.head_commit ?? 'none'}\nSession: ${sessionId}\n\nCommit artifacts record their parent commits. Apply each patch on its first parent; a root commit has no parent. Files record original modes and index stages.\n\nOriginal paths and content hashes:\n\n\`\`\`json\n${manifestBytes.toString()}\`\`\`\n`);
    if (staging >= 0) save('git', 'SOURCE.md', 'SOURCE.md', sourceText, { kind: 'manifest' });
    if (privateRoot >= 0) artifact(privateRoot, 'SOURCE.md', { sha256: hex(sourceText), size: sourceText.length }, fd => writeBytes(fd, sourceText), options.deadline);
    if (cleanupLossSha256({ worktree: item.worktree, loss: observeCleanupLoss(target, options) }) !== item.loss_sha256) fail('changed');
    return { protocol: 1, kind: 'operator_cleanup_archive', key, manifest_sha256: hex(manifestBytes),
      git_directory: layout.git ? join(options.staging_root, operation) : null,
      private_directory: layout.private ? join(repoHarnessHome(options.env), 'archive', item.worktree.repository_id, operation) : null, artifacts };
  } catch (error) { if (error instanceof CleanupArchiveError) throw error; throw new CleanupArchiveError('unavailable'); }
  finally { for (const fd of [source, staging, privateRoot]) if (fd >= 0) closeSync(fd); }
}
function stageCommits(target: CleanupObservationTarget, loss: CleanupLossEvidence, options: CleanupArchiveOptions,
  save: (storage: 'git' | 'private', path: string, source: string, bytes: Buffer, original: Original) => void): void {
  if (loss.kind !== 'registered') fail('unsupported');
  const runner = docSessionGitRunner({ ...options.env, GIT_NO_REPLACE_OBJECTS: '1' });
  for (const commit of loss.commits) {
    checkDeadline(options.deadline);
    const changed = runner.text(target.worktree, ['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', '-z', commit]).split('\0').filter(Boolean);
    if (changed.some(path => PRIVATE_FILE.test(path))) fail('unsafe_git_content');
    const patch = runner.bytes(target.worktree, ['format-patch', '-1', '--stdout', '--binary', '--full-index', '--no-signature', '--no-ext-diff', '--no-textconv', commit]);
    // Empty merge output is not a backup. Such commits need a separately approved representation.
    if (patch.length === 0) fail('unsupported');
    const parents = runner.text(target.worktree, ['rev-list', '--parents', '-n', '1', commit]).trim().split(' ').slice(1);
    save('git', `.cleanup/commits/${commit}.patch`, 'commit.patch', patch, { kind: 'commit', oid: commit, parents });
  }
}
