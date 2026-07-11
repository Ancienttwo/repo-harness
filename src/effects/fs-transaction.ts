import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  lstatSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  writeSync,
} from "fs";
import { createHash } from "crypto";
import { basename, dirname, relative, resolve, sep } from "path";
import type {
  AdoptionOperation,
  AdoptionOperationStatus,
  AdoptionPlan,
  AppendManagedBlockOperation,
  GitUntrackOperation,
  MkdirOperation,
  MoveOperation,
  RemoveOperation,
  WriteFileOperation,
} from "../core/adoption/operations";
import { resolveInsideRepo, resolveParentInsideRepo } from "./path-safety";
import { upsertManagedBlock } from "../core/adoption/managed-block";
import { runProcess } from "./process-runner";

const BACKUP_ROOT = ".ai/harness/backups/fs-transaction";
const LOCK_SUFFIX = ".repo-harness.lock";
let atomicWriteSequence = 0;
let transactionSequence = 0;

export interface ApplyOperationResult {
  readonly id: string;
  readonly kind: AdoptionOperation["kind"];
  readonly path?: string;
  readonly to?: string;
  readonly status: AdoptionOperationStatus;
  readonly backupPath?: string;
  readonly contentHash?: string;
  readonly error?: string;
}

export interface ApplyAdoptionPlanResult {
  readonly ok: boolean;
  readonly dryRun: boolean;
  readonly results: readonly ApplyOperationResult[];
  readonly transactionManifestPath?: string;
}

export interface FsTransactionManifestOperation {
  readonly id: string;
  readonly kind: AdoptionOperation["kind"];
  readonly path?: string;
  readonly to?: string;
  readonly status: AdoptionOperationStatus;
  readonly backupPath?: string;
  readonly contentHash?: string;
  readonly rollbackStrategy?: string;
  readonly error?: string;
}

export interface FsTransactionManifest {
  readonly protocol: 1;
  readonly command: "adopt";
  readonly createdAt: string;
  readonly repoRoot: string;
  readonly mode: AdoptionPlan["mode"];
  readonly operations: readonly FsTransactionManifestOperation[];
  readonly rollback: {
    readonly command: string;
  };
}

export interface RollbackOperationResult {
  readonly id: string;
  readonly kind: AdoptionOperation["kind"];
  readonly path?: string;
  readonly status: "rolled_back" | "skipped" | "failed";
  readonly action: "restore_backup" | "restore_git_index" | "delete_created_file" | "remove_empty_directory" | "none";
  readonly error?: string;
}

export interface RollbackAdoptionTransactionResult {
  readonly protocol: 1;
  readonly command: "adopt rollback";
  readonly repoRoot: string;
  readonly transactionManifestPath: string;
  readonly ok: boolean;
  readonly results: readonly RollbackOperationResult[];
}

function failure(operation: AdoptionOperation, error: string): ApplyOperationResult {
  return {
    id: operation.id,
    kind: operation.kind,
    path: operation.path,
    status: "failed",
    error,
  };
}

export function isSupportedAdoptionOperation(operation: AdoptionOperation): boolean {
  return ["mkdir", "writeFile", "appendManagedBlock", "move", "remove", "gitUntrack"].includes(operation.kind);
}

function unsupportedOperationReason(operation: AdoptionOperation): string {
  return `unsupported operation kind: ${operation.kind}`;
}

function assertNoSymlinkInPath(repoRoot: string, path: string): string | null {
  const target = resolveInsideRepo(repoRoot, path);
  if (!target.ok || !target.path) return target.error ?? "invalid path";
  const root = resolve(repoRoot);
  const rel = relative(root, target.path);
  let current = root;
  for (const part of rel.split(sep)) {
    if (!part) continue;
    current = resolve(current, part);
    if (!existsSync(current)) continue;
    if (lstatSync(current).isSymbolicLink()) return `symlink is not allowed in adoption path: ${path}`;
  }
  return null;
}

function ensureParent(repoRoot: string, path: string): string | null {
  const symlinkError = assertNoSymlinkInPath(repoRoot, path);
  if (symlinkError) return symlinkError;
  const parent = resolveParentInsideRepo(repoRoot, path);
  if (!parent.ok || !parent.path) return parent.error ?? "failed to resolve parent directory";
  mkdirSync(parent.path, { recursive: true });
  return null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fsyncDirectory(path: string): void {
  let fd: number | null = null;
  try {
    fd = openSync(path, constants.O_RDONLY);
    fsyncSync(fd);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (!["EINVAL", "EPERM", "ENOTSUP", "EISDIR"].includes(code ?? "")) throw error;
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

function writeFileDurably(path: string, content: string, mode?: number): void {
  let fd: number | null = null;
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC, mode);
    const data = Buffer.from(content);
    let offset = 0;
    while (offset < data.length) {
      offset += writeSync(fd, data, offset, data.length - offset);
    }
    fsyncSync(fd);
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

function sanitizeBackupStem(path: string): string {
  return path.replace(/[^a-zA-Z0-9._-]+/g, "__").replace(/^_+|_+$/g, "") || "file";
}

function contentHash(content: string): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function checkExpectedFileState(repoRoot: string, operation: AdoptionOperation): string | null {
  if (!operation.path) return null;
  const target = resolveInsideRepo(repoRoot, operation.path);
  if (!target.ok || !target.path) return target.error ?? "invalid operation path";
  const exists = existsSync(target.path);
  if (operation.expectedAbsent === true && exists) {
    return `target was created after planning: ${operation.path}`;
  }
  if (operation.expectedContentHash) {
    if (!exists || !lstatSync(target.path).isFile()) return `target changed after planning: ${operation.path}`;
    if (contentHash(readFileSync(target.path, "utf-8")) !== operation.expectedContentHash) {
      return `target content changed after planning: ${operation.path}`;
    }
  }
  return null;
}

function backupPathFor(path: string, backupRoot = BACKUP_ROOT): string {
  atomicWriteSequence += 1;
  return `${backupRoot}/${sanitizeBackupStem(path)}.${Date.now()}-${process.pid}-${atomicWriteSequence}.bak`;
}

function transactionDirFor(): string {
  transactionSequence += 1;
  return `${BACKUP_ROOT}/${Date.now()}-${process.pid}-${transactionSequence}`;
}

function withTargetLock<T>(targetPath: string, fn: () => T): T {
  const lockPath = `${targetPath}${LOCK_SUFFIX}`;
  let fd: number | null = null;
  let locked = false;
  try {
    fd = openSync(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    locked = true;
    writeSync(fd, `${process.pid}\n`);
    fsyncSync(fd);
    closeSync(fd);
    fd = null;
    return fn();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") throw new Error(`target is locked: ${lockPath}`);
    throw error;
  } finally {
    if (fd !== null) closeSync(fd);
    if (locked) {
      rmSync(lockPath, { force: true });
      fsyncDirectory(dirname(targetPath));
    }
  }
}

export interface AtomicWriteResult {
  readonly backupPath?: string;
}

export function atomicWriteFile(
  repoRoot: string,
  path: string,
  content: string,
  opts: { readonly mode?: number; readonly backupRoot?: string } = {},
): AtomicWriteResult {
  const target = resolveInsideRepo(repoRoot, path);
  if (!target.ok || !target.path) throw new Error(target.error ?? "invalid path");
  const targetPath = target.path;
  const symlinkError = assertNoSymlinkInPath(repoRoot, path);
  if (symlinkError) throw new Error(symlinkError);
  if (existsSync(targetPath) && !lstatSync(targetPath).isFile()) {
    throw new Error(`file target is not a regular file: ${path}`);
  }
  const existingMode = existsSync(targetPath) ? lstatSync(targetPath).mode & 0o777 : undefined;
  const parentError = ensureParent(repoRoot, path);
  if (parentError) throw new Error(parentError);

  return withTargetLock(targetPath, () => {
    let backupPath: string | undefined;
    if (existsSync(targetPath)) {
      backupPath = backupPathFor(path, opts.backupRoot);
      const backup = resolveInsideRepo(repoRoot, backupPath);
      if (!backup.ok || !backup.path) throw new Error(backup.error ?? "invalid backup path");
      const resolvedBackupPath = backup.path;
      const backupParentError = ensureParent(repoRoot, backupPath);
      if (backupParentError) throw new Error(backupParentError);
      writeFileDurably(resolvedBackupPath, readFileSync(targetPath, "utf-8"), existingMode);
      fsyncDirectory(dirname(resolvedBackupPath));
    }

    const tempPath = resolve(dirname(targetPath), `.${basename(targetPath)}.${process.pid}.${Date.now()}.tmp`);
    try {
      writeFileDurably(tempPath, content, opts.mode ?? existingMode);
      renameSync(tempPath, targetPath);
      fsyncDirectory(dirname(targetPath));
    } finally {
      rmSync(tempPath, { force: true });
    }

    return { backupPath };
  });
}

export function applyMkdirOperation(repoRoot: string, operation: MkdirOperation, dryRun = false): ApplyOperationResult {
  const target = resolveInsideRepo(repoRoot, operation.path);
  if (!target.ok || !target.path) return failure(operation, target.error ?? "invalid path");
  const symlinkError = assertNoSymlinkInPath(repoRoot, operation.path);
  if (symlinkError) return failure(operation, symlinkError);
  if (dryRun) return { id: operation.id, kind: operation.kind, path: operation.path, status: "planned" };
  // Only report an applied (rollback-eligible) result when we actually create the
  // directory. A directory that already existed must never be removed during rollback.
  if (existsSync(target.path)) {
    return { id: operation.id, kind: operation.kind, path: operation.path, status: "skipped" };
  }
  mkdirSync(target.path, { recursive: true });
  return { id: operation.id, kind: operation.kind, path: operation.path, status: "applied" };
}

export function applyWriteFileOperation(
  repoRoot: string,
  operation: WriteFileOperation,
  dryRun = false,
  backupRoot?: string,
): ApplyOperationResult {
  const target = resolveInsideRepo(repoRoot, operation.path);
  if (!target.ok || !target.path) return failure(operation, target.error ?? "invalid path");
  const symlinkError = assertNoSymlinkInPath(repoRoot, operation.path);
  if (symlinkError) return failure(operation, symlinkError);
  const preconditionError = checkExpectedFileState(repoRoot, operation);
  if (preconditionError) return failure(operation, preconditionError);
  if (operation.ifMissing === true && existsSync(target.path)) {
    return { id: operation.id, kind: operation.kind, path: operation.path, status: "skipped" };
  }
  if (existsSync(target.path) && readFileSync(target.path, "utf-8") === operation.content) {
    return { id: operation.id, kind: operation.kind, path: operation.path, status: "skipped" };
  }
  if (dryRun) return { id: operation.id, kind: operation.kind, path: operation.path, status: "planned" };
  try {
    const write = atomicWriteFile(repoRoot, operation.path, operation.content, { mode: operation.mode, backupRoot });
    return {
      id: operation.id,
      kind: operation.kind,
      path: operation.path,
      status: "applied",
      backupPath: write.backupPath,
      contentHash: contentHash(operation.content),
    };
  } catch (error) {
    return failure(operation, errorMessage(error));
  }
}

export function applyAppendManagedBlockOperation(
  repoRoot: string,
  operation: AppendManagedBlockOperation,
  dryRun = false,
  backupRoot?: string,
): ApplyOperationResult {
  const target = resolveInsideRepo(repoRoot, operation.path);
  if (!target.ok || !target.path) return failure(operation, target.error ?? "invalid path");
  const symlinkError = assertNoSymlinkInPath(repoRoot, operation.path);
  if (symlinkError) return failure(operation, symlinkError);
  const preconditionError = checkExpectedFileState(repoRoot, operation);
  if (preconditionError) return failure(operation, preconditionError);
  const existing = existsSync(target.path) ? readFileSync(target.path, "utf-8") : "";
  const update = upsertManagedBlock(existing, operation);
  if (!update.ok) return failure(operation, update.error ?? "failed to update managed block");
  if (!update.changed) {
    return { id: operation.id, kind: operation.kind, path: operation.path, status: "skipped" };
  }
  if (dryRun) return { id: operation.id, kind: operation.kind, path: operation.path, status: "planned" };
  try {
    const content = update.content ?? "";
    const write = atomicWriteFile(repoRoot, operation.path, content, { backupRoot });
    return {
      id: operation.id,
      kind: operation.kind,
      path: operation.path,
      status: "applied",
      backupPath: write.backupPath,
      contentHash: contentHash(content),
    };
  } catch (error) {
    return failure(operation, errorMessage(error));
  }
}

function moveIntoTransactionBackup(repoRoot: string, path: string, transactionDir: string): string {
  const source = resolveInsideRepo(repoRoot, path);
  if (!source.ok || !source.path) throw new Error(source.error ?? "invalid source path");
  const backupPath = `${transactionDir}/removed/${sanitizeBackupStem(path)}.${Date.now()}-${process.pid}-${atomicWriteSequence + 1}`;
  const backup = resolveInsideRepo(repoRoot, backupPath);
  if (!backup.ok || !backup.path) throw new Error(backup.error ?? "invalid backup path");
  const parentError = ensureParent(repoRoot, backupPath);
  if (parentError) throw new Error(parentError);
  renameSync(source.path, backup.path);
  fsyncDirectory(dirname(source.path));
  fsyncDirectory(dirname(backup.path));
  return backupPath;
}

function targetContentHash(targetPath: string): string | undefined {
  if (!existsSync(targetPath) || !lstatSync(targetPath).isFile()) return undefined;
  return contentHash(readFileSync(targetPath, "utf-8"));
}

export function applyMoveOperation(
  repoRoot: string,
  operation: MoveOperation,
  dryRun = false,
): ApplyOperationResult {
  const source = resolveInsideRepo(repoRoot, operation.path);
  const destination = resolveInsideRepo(repoRoot, operation.to);
  if (!source.ok || !source.path) return failure(operation, source.error ?? "invalid move source");
  if (!destination.ok || !destination.path) return failure(operation, destination.error ?? "invalid move destination");
  const sourceSymlinkError = assertNoSymlinkInPath(repoRoot, operation.path);
  const destinationSymlinkError = assertNoSymlinkInPath(repoRoot, operation.to);
  if (sourceSymlinkError || destinationSymlinkError) return failure(operation, sourceSymlinkError ?? destinationSymlinkError ?? "invalid move path");
  const preconditionError = checkExpectedFileState(repoRoot, operation);
  if (preconditionError) return failure(operation, preconditionError);
  if (!existsSync(source.path)) return { id: operation.id, kind: operation.kind, path: operation.path, to: operation.to, status: "skipped" };
  if (!lstatSync(source.path).isFile()) return failure(operation, `move source is not a regular file: ${operation.path}`);
  if (existsSync(destination.path)) return failure(operation, `move destination already exists: ${operation.to}`);
  if (dryRun) return { id: operation.id, kind: operation.kind, path: operation.path, to: operation.to, status: "planned" };
  try {
    const parentError = ensureParent(repoRoot, operation.to);
    if (parentError) throw new Error(parentError);
    renameSync(source.path, destination.path);
    fsyncDirectory(dirname(source.path));
    fsyncDirectory(dirname(destination.path));
    return {
      id: operation.id,
      kind: operation.kind,
      path: operation.path,
      to: operation.to,
      status: "applied",
      contentHash: targetContentHash(destination.path),
    };
  } catch (error) {
    return failure(operation, errorMessage(error));
  }
}

export function applyRemoveOperation(
  repoRoot: string,
  operation: RemoveOperation,
  dryRun = false,
  transactionDir?: string,
): ApplyOperationResult {
  const target = resolveInsideRepo(repoRoot, operation.path);
  if (!target.ok || !target.path) return failure(operation, target.error ?? "invalid remove path");
  const symlinkError = assertNoSymlinkInPath(repoRoot, operation.path);
  if (symlinkError) return failure(operation, symlinkError);
  const preconditionError = checkExpectedFileState(repoRoot, operation);
  if (preconditionError) return failure(operation, preconditionError);
  if (!existsSync(target.path)) return { id: operation.id, kind: operation.kind, path: operation.path, status: "skipped" };
  if (!lstatSync(target.path).isFile()) return failure(operation, `remove target is not a regular file: ${operation.path}`);
  if (dryRun) return { id: operation.id, kind: operation.kind, path: operation.path, status: "planned" };
  if (!transactionDir) return failure(operation, "remove operation requires a transaction directory");
  try {
    const backupPath = moveIntoTransactionBackup(repoRoot, operation.path, transactionDir);
    return { id: operation.id, kind: operation.kind, path: operation.path, status: "applied", backupPath };
  } catch (error) {
    return failure(operation, errorMessage(error));
  }
}

export function applyGitUntrackOperation(repoRoot: string, operation: GitUntrackOperation, dryRun = false): ApplyOperationResult {
  const target = resolveInsideRepo(repoRoot, operation.path);
  if (!target.ok || !target.path) return failure(operation, target.error ?? "invalid git untrack path");
  const symlinkError = assertNoSymlinkInPath(repoRoot, operation.path);
  if (symlinkError) return failure(operation, symlinkError);
  const preconditionError = checkExpectedFileState(repoRoot, operation);
  if (preconditionError) return failure(operation, preconditionError);
  const tracked = runProcess("git", ["-C", repoRoot, "ls-files", "--error-unmatch", "--", operation.path]);
  if (!tracked.ok) return { id: operation.id, kind: operation.kind, path: operation.path, status: "skipped" };
  if (dryRun) return { id: operation.id, kind: operation.kind, path: operation.path, status: "planned" };
  const result = runProcess("git", ["-C", repoRoot, "rm", "--cached", "--force", "--quiet", "--", operation.path]);
  return result.ok
    ? { id: operation.id, kind: operation.kind, path: operation.path, status: "applied" }
    : failure(operation, result.stderr || result.error || "git rm --cached failed");
}

function writeTransactionManifest(plan: AdoptionPlan, transactionDir: string, results: readonly ApplyOperationResult[]): string {
  const manifestPath = `${transactionDir}/manifest.json`;
  const manifest: FsTransactionManifest = {
    protocol: 1,
    command: "adopt",
    createdAt: new Date().toISOString(),
    repoRoot: plan.repoRoot,
    mode: plan.mode,
    operations: results.map((result) => {
      const operation = plan.operations.find((entry) => entry.id === result.id);
      return {
        id: result.id,
        kind: result.kind,
        path: result.path,
        to: result.to,
        status: result.status,
        backupPath: result.backupPath,
        contentHash: result.contentHash,
        rollbackStrategy: operation?.rollback?.strategy,
        error: result.error,
      };
    }),
    rollback: {
      command: `repo-harness adopt rollback --transaction ${manifestPath}`,
    },
  };
  atomicWriteFile(plan.repoRoot, manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  return manifestPath;
}

function finalizeTransactionManifest(
  plan: AdoptionPlan,
  transactionDir: string,
  results: readonly ApplyOperationResult[],
): { readonly results: readonly ApplyOperationResult[]; readonly transactionManifestPath?: string } {
  try {
    return { results, transactionManifestPath: writeTransactionManifest(plan, transactionDir, results) };
  } catch (error) {
    return {
      results: [
        ...results,
        {
          id: "transaction-manifest",
          kind: "runCheck",
          status: "failed",
          error: `failed to persist transaction manifest: ${errorMessage(error)}`,
        },
      ],
    };
  }
}

function preflightTransactionManifest(repoRoot: string, transactionDir: string): string | null {
  const manifestPath = `${transactionDir}/manifest.json`;
  const manifest = resolveInsideRepo(repoRoot, manifestPath);
  if (!manifest.ok || !manifest.path) return manifest.error ?? "invalid transaction manifest path";
  const symlinkError = assertNoSymlinkInPath(repoRoot, manifestPath);
  if (symlinkError) return symlinkError;
  const root = resolve(repoRoot);
  const parent = dirname(manifest.path);
  const rel = relative(root, parent);
  let current = root;
  for (const part of rel.split(sep)) {
    if (!part) continue;
    current = resolve(current, part);
    if (existsSync(current) && !lstatSync(current).isDirectory()) {
      return `transaction manifest parent is not a directory: ${relative(root, current).replace(/\\/g, "/")}`;
    }
  }
  return null;
}

function preflightOperation(repoRoot: string, operation: AdoptionOperation): string | null {
  if (!isSupportedAdoptionOperation(operation)) return unsupportedOperationReason(operation);
  if (!operation.path) return `operation kind ${operation.kind} is missing a path`;
  const target = resolveInsideRepo(repoRoot, operation.path);
  if (!target.ok || !target.path) return target.error ?? "invalid operation path";
  const symlinkError = assertNoSymlinkInPath(repoRoot, operation.path);
  if (symlinkError) return symlinkError;
  const preconditionError = checkExpectedFileState(repoRoot, operation);
  if (preconditionError) return preconditionError;

  if (operation.kind === "move") {
    const destination = resolveInsideRepo(repoRoot, operation.to);
    if (!destination.ok || !destination.path) return destination.error ?? "invalid move destination";
    const destinationSymlinkError = assertNoSymlinkInPath(repoRoot, operation.to);
    if (destinationSymlinkError) return destinationSymlinkError;
    if (existsSync(target.path) && existsSync(destination.path)) return `move destination already exists: ${operation.to}`;
    if (existsSync(target.path) && !lstatSync(target.path).isFile()) return `move source is not a regular file: ${operation.path}`;
    return null;
  }

  if (operation.kind === "remove" && existsSync(target.path) && !lstatSync(target.path).isFile()) {
    return `remove target is not a regular file: ${operation.path}`;
  }

  if (operation.kind === "mkdir") {
    if (existsSync(target.path) && !lstatSync(target.path).isDirectory()) return `mkdir target is not a directory: ${operation.path}`;
    return null;
  }

  if ((operation.kind === "writeFile" || operation.kind === "appendManagedBlock") && existsSync(target.path) && !lstatSync(target.path).isFile()) {
    return `file target is not a regular file: ${operation.path}`;
  }

  return null;
}

export function applyAdoptionPlan(plan: AdoptionPlan, dryRun = false): ApplyAdoptionPlanResult {
  const preflight = plan.operations.map((operation) => ({ operation, error: preflightOperation(plan.repoRoot, operation) }));
  const preflightFailures = preflight.filter((entry) => entry.error);
  const transactionDir = dryRun ? undefined : transactionDirFor();
  const manifestPreflightError = transactionDir ? preflightTransactionManifest(plan.repoRoot, transactionDir) : null;
  if (preflightFailures.length > 0 || manifestPreflightError) {
    const results: ApplyOperationResult[] = preflight.map(({ operation, error }) =>
      error
        ? failure(operation, error)
        : { id: operation.id, kind: operation.kind, path: operation.path, status: "planned" as const },
    );
    if (manifestPreflightError) {
      results.push({
        id: "transaction-manifest",
        kind: "runCheck",
        status: "failed",
        error: `transaction manifest preflight failed: ${manifestPreflightError}`,
      });
    }
    const finalized = transactionDir && !manifestPreflightError
      ? finalizeTransactionManifest(plan, transactionDir, results)
      : { results };
    return {
      ok: false,
      dryRun,
      results: finalized.results,
      transactionManifestPath: finalized.transactionManifestPath,
    };
  }

  const results = plan.operations.map((operation) => {
    switch (operation.kind) {
      case "mkdir":
        return applyMkdirOperation(plan.repoRoot, operation, dryRun);
      case "writeFile":
        return applyWriteFileOperation(plan.repoRoot, operation, dryRun, transactionDir);
      case "appendManagedBlock":
        return applyAppendManagedBlockOperation(plan.repoRoot, operation, dryRun, transactionDir);
      case "move":
        return applyMoveOperation(plan.repoRoot, operation, dryRun);
      case "remove":
        return applyRemoveOperation(plan.repoRoot, operation, dryRun, transactionDir);
      case "gitUntrack":
        return applyGitUntrackOperation(plan.repoRoot, operation, dryRun);
      default:
        return failure(operation, `unsupported operation kind: ${operation.kind}`);
    }
  });
  const finalized = transactionDir ? finalizeTransactionManifest(plan, transactionDir, results) : { results };
  const ok = finalized.results.every((result) => result.status !== "failed");

  return {
    ok,
    dryRun,
    results: finalized.results,
    transactionManifestPath: finalized.transactionManifestPath,
  };
}

function resolveTransactionManifest(repoRoot: string, transaction: string): { ok: true; path: string; rel: string } | { ok: false; error: string } {
  const root = resolve(repoRoot);
  const target = resolve(root, transaction);
  const rel = relative(root, target).replace(/\\/g, "/");
  if (rel === "" || rel.startsWith("..") || rel.includes("\0")) {
    return { ok: false, error: `transaction manifest escapes repo root: ${transaction}` };
  }
  if (!rel.startsWith(`${BACKUP_ROOT}/`) || !rel.endsWith("/manifest.json")) {
    return { ok: false, error: `transaction manifest must be under ${BACKUP_ROOT}/<transaction>/manifest.json` };
  }
  return { ok: true, path: target, rel };
}

function rollbackFailed(operation: FsTransactionManifestOperation, action: RollbackOperationResult["action"], error: string): RollbackOperationResult {
  return { id: operation.id, kind: operation.kind, path: operation.path, status: "failed", action, error };
}

function rollbackFileOperation(repoRoot: string, operation: FsTransactionManifestOperation): RollbackOperationResult {
  if (!operation.path) return rollbackFailed(operation, "none", "file operation is missing path");
  const targetSymlinkError = assertNoSymlinkInPath(repoRoot, operation.path);
  if (targetSymlinkError) return rollbackFailed(operation, "none", targetSymlinkError);
  const target = resolveInsideRepo(repoRoot, operation.path);
  if (!target.ok || !target.path) return rollbackFailed(operation, "none", target.error ?? "invalid path");

  if (operation.backupPath) {
    const backupSymlinkError = assertNoSymlinkInPath(repoRoot, operation.backupPath);
    if (backupSymlinkError) return rollbackFailed(operation, "restore_backup", backupSymlinkError);
    const backup = resolveInsideRepo(repoRoot, operation.backupPath);
    if (!backup.ok || !backup.path) return rollbackFailed(operation, "restore_backup", backup.error ?? "invalid backup path");
    if (!existsSync(backup.path)) return rollbackFailed(operation, "restore_backup", `missing backup: ${operation.backupPath}`);
    try {
      // Fail closed: never overwrite a target whose current content diverges from
      // what this transaction applied (e.g. the user edited the file after apply).
      // Mirrors the delete_created_file guard so both destructive paths are symmetric.
      if (existsSync(target.path)) {
        if (!operation.contentHash) {
          return rollbackFailed(operation, "restore_backup", "missing content hash for replaced file rollback");
        }
        const currentHash = contentHash(readFileSync(target.path, "utf-8"));
        if (currentHash !== operation.contentHash) {
          return rollbackFailed(operation, "restore_backup", "current file hash differs from transaction content hash");
        }
      }
      atomicWriteFile(repoRoot, operation.path, readFileSync(backup.path, "utf-8"));
      return { id: operation.id, kind: operation.kind, path: operation.path, status: "rolled_back", action: "restore_backup" };
    } catch (error) {
      return rollbackFailed(operation, "restore_backup", errorMessage(error));
    }
  }

  if (!operation.contentHash) return rollbackFailed(operation, "delete_created_file", "missing content hash for created file rollback");
  if (!existsSync(target.path)) {
    return { id: operation.id, kind: operation.kind, path: operation.path, status: "skipped", action: "delete_created_file" };
  }
  try {
    // Read + hash inside the try so an unreadable target (e.g. replaced by a
    // directory) returns a structured failed result instead of throwing to the CLI.
    const currentHash = contentHash(readFileSync(target.path, "utf-8"));
    if (currentHash !== operation.contentHash) {
      return rollbackFailed(operation, "delete_created_file", "current file hash differs from transaction content hash");
    }
    rmSync(target.path);
    fsyncDirectory(dirname(target.path));
    return { id: operation.id, kind: operation.kind, path: operation.path, status: "rolled_back", action: "delete_created_file" };
  } catch (error) {
    return rollbackFailed(operation, "delete_created_file", errorMessage(error));
  }
}

function rollbackMkdirOperation(repoRoot: string, operation: FsTransactionManifestOperation): RollbackOperationResult {
  if (!operation.path) return rollbackFailed(operation, "remove_empty_directory", "mkdir operation is missing path");
  const symlinkError = assertNoSymlinkInPath(repoRoot, operation.path);
  if (symlinkError) return rollbackFailed(operation, "remove_empty_directory", symlinkError);
  const target = resolveInsideRepo(repoRoot, operation.path);
  if (!target.ok || !target.path) return rollbackFailed(operation, "remove_empty_directory", target.error ?? "invalid path");
  if (!existsSync(target.path)) {
    return { id: operation.id, kind: operation.kind, path: operation.path, status: "skipped", action: "remove_empty_directory" };
  }
  try {
    rmdirSync(target.path);
    fsyncDirectory(dirname(target.path));
    return { id: operation.id, kind: operation.kind, path: operation.path, status: "rolled_back", action: "remove_empty_directory" };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (["ENOENT", "ENOTEMPTY", "EEXIST"].includes(code ?? "")) {
      return { id: operation.id, kind: operation.kind, path: operation.path, status: "skipped", action: "remove_empty_directory" };
    }
    return rollbackFailed(operation, "remove_empty_directory", errorMessage(error));
  }
}

function isValidManifestOperation(operation: unknown, transactionDir: string): operation is FsTransactionManifestOperation {
  if (typeof operation !== "object" || operation === null) return false;
  const op = operation as Record<string, unknown>;
  if (typeof op.id !== "string" || typeof op.kind !== "string" || typeof op.status !== "string") return false;
  if (op.path !== undefined && typeof op.path !== "string") return false;
  if (op.to !== undefined && typeof op.to !== "string") return false;
  if (op.contentHash !== undefined && typeof op.contentHash !== "string") return false;
  if (op.rollbackStrategy !== undefined && typeof op.rollbackStrategy !== "string") return false;
  if (op.error !== undefined && typeof op.error !== "string") return false;
  if (op.backupPath !== undefined) {
    if (typeof op.backupPath !== "string") return false;
    // A manifest is untrusted file data: pin the restore source to this manifest's
    // own transaction directory so a crafted manifest cannot point backups elsewhere.
    const normalized = op.backupPath.replace(/\\/g, "/");
    if (!normalized.startsWith(`${transactionDir}/`)) return false;
  }
  return true;
}

function rollbackMoveOperation(repoRoot: string, operation: FsTransactionManifestOperation): RollbackOperationResult {
  if (!operation.path || !operation.to) return rollbackFailed(operation, "none", "move operation is missing source or destination");
  const sourceSymlinkError = assertNoSymlinkInPath(repoRoot, operation.path);
  const destinationSymlinkError = assertNoSymlinkInPath(repoRoot, operation.to);
  if (sourceSymlinkError || destinationSymlinkError) {
    return rollbackFailed(operation, "none", sourceSymlinkError ?? destinationSymlinkError ?? "invalid move path");
  }
  const source = resolveInsideRepo(repoRoot, operation.path);
  const destination = resolveInsideRepo(repoRoot, operation.to);
  if (!source.ok || !source.path) return rollbackFailed(operation, "none", source.error ?? "invalid move source");
  if (!destination.ok || !destination.path) return rollbackFailed(operation, "none", destination.error ?? "invalid move destination");
  if (existsSync(source.path)) return rollbackFailed(operation, "none", "move source is occupied; refusing to overwrite it");
  if (!existsSync(destination.path)) return { id: operation.id, kind: operation.kind, path: operation.path, status: "skipped", action: "none" };
  try {
    if (operation.contentHash) {
      const currentHash = targetContentHash(destination.path);
      if (currentHash !== operation.contentHash) {
        return rollbackFailed(operation, "none", "move destination hash differs from transaction content hash");
      }
    }
    renameSync(destination.path, source.path);
    fsyncDirectory(dirname(destination.path));
    fsyncDirectory(dirname(source.path));
    return { id: operation.id, kind: operation.kind, path: operation.path, status: "rolled_back", action: "restore_backup" };
  } catch (error) {
    return rollbackFailed(operation, "none", errorMessage(error));
  }
}

function rollbackRemoveOperation(repoRoot: string, operation: FsTransactionManifestOperation): RollbackOperationResult {
  if (!operation.path || !operation.backupPath) return rollbackFailed(operation, "restore_backup", "remove operation is missing path or backup");
  const targetSymlinkError = assertNoSymlinkInPath(repoRoot, operation.path);
  const backupSymlinkError = assertNoSymlinkInPath(repoRoot, operation.backupPath);
  if (targetSymlinkError || backupSymlinkError) {
    return rollbackFailed(operation, "restore_backup", targetSymlinkError ?? backupSymlinkError ?? "invalid remove path");
  }
  const target = resolveInsideRepo(repoRoot, operation.path);
  const backup = resolveInsideRepo(repoRoot, operation.backupPath);
  if (!target.ok || !target.path) return rollbackFailed(operation, "restore_backup", target.error ?? "invalid removed path");
  if (!backup.ok || !backup.path) return rollbackFailed(operation, "restore_backup", backup.error ?? "invalid remove backup");
  if (existsSync(target.path)) return rollbackFailed(operation, "restore_backup", "removed path is occupied; refusing to overwrite it");
  if (!existsSync(backup.path)) return rollbackFailed(operation, "restore_backup", `missing backup: ${operation.backupPath}`);
  try {
    const parentError = ensureParent(repoRoot, operation.path);
    if (parentError) throw new Error(parentError);
    renameSync(backup.path, target.path);
    fsyncDirectory(dirname(backup.path));
    fsyncDirectory(dirname(target.path));
    return { id: operation.id, kind: operation.kind, path: operation.path, status: "rolled_back", action: "restore_backup" };
  } catch (error) {
    return rollbackFailed(operation, "restore_backup", errorMessage(error));
  }
}

function rollbackGitUntrackOperation(repoRoot: string, operation: FsTransactionManifestOperation): RollbackOperationResult {
  if (!operation.path) return rollbackFailed(operation, "restore_git_index", "git untrack operation is missing path");
  const symlinkError = assertNoSymlinkInPath(repoRoot, operation.path);
  if (symlinkError) return rollbackFailed(operation, "restore_git_index", symlinkError);
  const target = resolveInsideRepo(repoRoot, operation.path);
  if (!target.ok || !target.path) return rollbackFailed(operation, "restore_git_index", target.error ?? "invalid git path");
  if (!existsSync(target.path) || !lstatSync(target.path).isFile()) {
    return rollbackFailed(operation, "restore_git_index", "cannot restore git index because the file is absent or not regular");
  }
  const tracked = runProcess("git", ["-C", repoRoot, "ls-files", "--error-unmatch", "--", operation.path]);
  if (tracked.ok) {
    return { id: operation.id, kind: operation.kind, path: operation.path, status: "skipped", action: "restore_git_index" };
  }
  const restore = runProcess("git", ["-C", repoRoot, "add", "--", operation.path]);
  return restore.ok
    ? { id: operation.id, kind: operation.kind, path: operation.path, status: "rolled_back", action: "restore_git_index" }
    : rollbackFailed(operation, "restore_git_index", restore.stderr || restore.error || "git add failed");
}

function readTransactionManifest(repoRoot: string, transaction: string): { manifest?: FsTransactionManifest; rel?: string; error?: string } {
  const resolved = resolveTransactionManifest(repoRoot, transaction);
  if (!resolved.ok) return { error: resolved.error };
  const symlinkError = assertNoSymlinkInPath(repoRoot, resolved.rel);
  if (symlinkError) return { error: symlinkError };
  if (!existsSync(resolved.path)) return { error: `transaction manifest not found: ${resolved.rel}` };
  try {
    const manifest = JSON.parse(readFileSync(resolved.path, "utf-8")) as FsTransactionManifest;
    const transactionDir = resolved.rel.replace(/\/manifest\.json$/, "");
    if (
      manifest.protocol !== 1 ||
      manifest.command !== "adopt" ||
      !Array.isArray(manifest.operations) ||
      !manifest.operations.every((operation) => isValidManifestOperation(operation, transactionDir))
    ) {
      return { error: `invalid transaction manifest: ${resolved.rel}` };
    }
    return { manifest, rel: resolved.rel };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export function rollbackAdoptionTransaction(opts: { readonly repoRoot: string; readonly transaction: string }): RollbackAdoptionTransactionResult {
  const repoRoot = resolve(opts.repoRoot);
  const loaded = readTransactionManifest(repoRoot, opts.transaction);
  if (!loaded.manifest || !loaded.rel) {
    return {
      protocol: 1,
      command: "adopt rollback",
      repoRoot,
      transactionManifestPath: opts.transaction,
      ok: false,
      results: [
        {
          id: "transaction-manifest",
          kind: "runCheck",
          status: "failed",
          action: "none",
          error: loaded.error ?? "failed to read transaction manifest",
        },
      ],
    };
  }

  const reversed = [...loaded.manifest.operations].reverse();
  const restoreIndex = reversed.filter((operation) => operation.kind === "gitUntrack");
  const results = reversed.filter((operation) => operation.kind !== "gitUntrack").map((operation) => {
    if (operation.status !== "applied") {
      return { id: operation.id, kind: operation.kind, path: operation.path, status: "skipped" as const, action: "none" as const };
    }
    if (operation.kind === "mkdir") return rollbackMkdirOperation(repoRoot, operation);
    if (operation.kind === "writeFile" || operation.kind === "appendManagedBlock") return rollbackFileOperation(repoRoot, operation);
    if (operation.kind === "move") return rollbackMoveOperation(repoRoot, operation);
    if (operation.kind === "remove") return rollbackRemoveOperation(repoRoot, operation);
    return rollbackFailed(operation, "none", `unsupported rollback operation kind: ${operation.kind}`);
  });
  for (const operation of restoreIndex) {
    results.push(
      operation.status === "applied"
        ? rollbackGitUntrackOperation(repoRoot, operation)
        : { id: operation.id, kind: operation.kind, path: operation.path, status: "skipped", action: "none" },
    );
  }

  return {
    protocol: 1,
    command: "adopt rollback",
    repoRoot,
    transactionManifestPath: loaded.rel,
    ok: results.every((result) => result.status !== "failed"),
    results,
  };
}
