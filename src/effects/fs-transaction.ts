import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  writeSync,
} from "fs";
import { createHash } from "crypto";
import { basename, dirname, relative, resolve } from "path";
import type {
  AdoptionOperation,
  AdoptionOperationStatus,
  AdoptionPlan,
  AppendManagedBlockOperation,
  MkdirOperation,
  WriteFileOperation,
} from "../core/adoption/operations";
import { isWorkflowContractInstallOperation } from "../core/adoption/workflow-contract-plan";
import { resolveInsideRepo, resolveParentInsideRepo } from "./path-safety";
import { upsertManagedBlock } from "./managed-block";

const BACKUP_ROOT = ".ai/harness/backups/fs-transaction";
const LOCK_SUFFIX = ".repo-harness.lock";
let atomicWriteSequence = 0;
let transactionSequence = 0;

export interface ApplyOperationResult {
  readonly id: string;
  readonly kind: AdoptionOperation["kind"];
  readonly path?: string;
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
  readonly action: "restore_backup" | "delete_created_file" | "remove_empty_directory" | "none";
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
  if (operation.kind === "mkdir" || operation.kind === "appendManagedBlock") return true;
  return operation.kind === "writeFile" && (operation.ifMissing === true || isWorkflowContractInstallOperation(operation));
}

function unsupportedOperationReason(operation: AdoptionOperation): string {
  if (operation.kind === "writeFile") {
    return "writeFile applicator only supports ifMissing operations and workflow-contract install";
  }
  return `unsupported operation kind: ${operation.kind}`;
}

function ensureParent(repoRoot: string, path: string): string | null {
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
      writeFileDurably(resolvedBackupPath, readFileSync(targetPath, "utf-8"));
      fsyncDirectory(dirname(resolvedBackupPath));
    }

    const tempPath = resolve(dirname(targetPath), `.${basename(targetPath)}.${process.pid}.${Date.now()}.tmp`);
    try {
      writeFileDurably(tempPath, content, opts.mode);
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
  if (operation.ifMissing === true && existsSync(target.path)) {
    return { id: operation.id, kind: operation.kind, path: operation.path, status: "skipped" };
  }
  if (operation.ifMissing !== true && !isWorkflowContractInstallOperation(operation)) {
    return failure(operation, "writeFile applicator only supports ifMissing operations and workflow-contract install");
  }
  if (operation.ifMissing !== true && existsSync(target.path) && readFileSync(target.path, "utf-8") === operation.content) {
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

export function applyAdoptionPlan(plan: AdoptionPlan, dryRun = false): ApplyAdoptionPlanResult {
  const unsupported = plan.operations.filter((operation) => !isSupportedAdoptionOperation(operation));
  if (unsupported.length > 0) {
    return {
      ok: false,
      dryRun,
      results: unsupported.map((operation) => failure(operation, unsupportedOperationReason(operation))),
    };
  }

  const transactionDir = dryRun ? undefined : transactionDirFor();
  const results = plan.operations.map((operation) => {
    switch (operation.kind) {
      case "mkdir":
        return applyMkdirOperation(plan.repoRoot, operation, dryRun);
      case "writeFile":
        return applyWriteFileOperation(plan.repoRoot, operation, dryRun, transactionDir);
      case "appendManagedBlock":
        return applyAppendManagedBlockOperation(plan.repoRoot, operation, dryRun, transactionDir);
      default:
        return failure(operation, `unsupported operation kind: ${operation.kind}`);
    }
  });
  const ok = results.every((result) => result.status !== "failed");
  const transactionManifestPath = !dryRun && ok && transactionDir ? writeTransactionManifest(plan, transactionDir, results) : undefined;

  return {
    ok,
    dryRun,
    results,
    transactionManifestPath,
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
  const target = resolveInsideRepo(repoRoot, operation.path);
  if (!target.ok || !target.path) return rollbackFailed(operation, "none", target.error ?? "invalid path");

  if (operation.backupPath) {
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

function readTransactionManifest(repoRoot: string, transaction: string): { manifest?: FsTransactionManifest; rel?: string; error?: string } {
  const resolved = resolveTransactionManifest(repoRoot, transaction);
  if (!resolved.ok) return { error: resolved.error };
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

  const results = [...loaded.manifest.operations].reverse().map((operation) => {
    if (operation.status !== "applied") {
      return { id: operation.id, kind: operation.kind, path: operation.path, status: "skipped" as const, action: "none" as const };
    }
    if (operation.kind === "mkdir") return rollbackMkdirOperation(repoRoot, operation);
    if (operation.kind === "writeFile" || operation.kind === "appendManagedBlock") return rollbackFileOperation(repoRoot, operation);
    return rollbackFailed(operation, "none", `unsupported rollback operation kind: ${operation.kind}`);
  });

  return {
    protocol: 1,
    command: "adopt rollback",
    repoRoot,
    transactionManifestPath: loaded.rel,
    ok: results.every((result) => result.status !== "failed"),
    results,
  };
}
