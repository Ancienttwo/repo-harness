import { createHash } from "crypto";
import {
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
} from "fs";
import { basename, dirname, join, relative } from "path";
import { acquireExclusiveDirectoryLock } from "./locking/exclusive-directory-lock";

export type SkillTreeCommitResult =
  | { readonly status: "committed"; readonly actual: string }
  | { readonly status: "failed"; readonly detail: string };

export interface SkillTreeCommitDependencies {
  readonly copyTree?: typeof cpSync;
  readonly renameTree?: typeof renameSync;
}

function pathEntryExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/** Content-address one installed Skill tree without following nested symlinks. */
export function skillTreeSha256(root: string): string {
  const hash = createHash("sha256");
  const walk = (directory: string): void => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const relativePath = relative(root, path).split("\\").join("/");
      const stat = lstatSync(path);
      if (stat.isDirectory()) {
        walk(path);
      } else if (stat.isSymbolicLink()) {
        hash.update(`L\0${relativePath}\0${readlinkSync(path)}\0`);
      } else if (stat.isFile()) {
        const content = readFileSync(path);
        hash.update(`F\0${relativePath}\0${content.length}\0`);
        hash.update(content);
        hash.update("\0");
      } else {
        throw new Error(`unsupported skill-tree entry type: ${relativePath}`);
      }
    }
  };
  walk(root);
  return `sha256:${hash.digest("hex")}`;
}

/**
 * Copies a verified tree through a same-filesystem temporary directory, then
 * atomically renames it into shared staging without replacing an existing
 * destination. The lock serializes repo-harness writers for this skill; every
 * failure path removes only transaction-owned temporary state.
 */
export function commitVerifiedSkillTree(
  source: string,
  destination: string,
  expected: string,
  dependencies: SkillTreeCommitDependencies = {},
): SkillTreeCommitResult {
  const copyTree = dependencies.copyTree ?? cpSync;
  const renameTree = dependencies.renameTree ?? renameSync;
  const requestedParent = dirname(destination);
  mkdirSync(requestedParent, { recursive: true });
  const parent = realpathSync(requestedParent);
  const canonicalDestination = join(parent, basename(destination));
  const key = createHash("sha256").update(canonicalDestination).digest("hex");
  const transactionPrefix = `.repo-harness-skill-stage-${key}-`;
  const lock = acquireExclusiveDirectoryLock(parent, `.repo-harness-skill-lock-${key}`, {
    reclaimStaleOwner: true,
  });
  let transactionRoot: string | null = null;
  try {
    lock.assertOwned();
    for (const entry of readdirSync(parent)) {
      if (!entry.startsWith(transactionPrefix)) continue;
      rmSync(join(parent, entry), { recursive: true, force: true });
    }
    transactionRoot = mkdtempSync(join(parent, transactionPrefix));
    const payload = join(transactionRoot, "payload");
    copyTree(source, payload, {
      recursive: true,
      force: false,
      errorOnExist: true,
      verbatimSymlinks: true,
    });
    const actual = skillTreeSha256(payload);
    if (actual !== expected) {
      return { status: "failed", detail: `post-copy integrity mismatch: expected=${expected}; actual=${actual}` };
    }
    lock.assertOwned();
    if (pathEntryExists(canonicalDestination)) {
      return { status: "failed", detail: `refusing to overwrite existing staging skill ${canonicalDestination}` };
    }
    lock.assertOwned();
    renameTree(payload, canonicalDestination);
    return { status: "committed", actual };
  } catch (error) {
    return { status: "failed", detail: `cannot commit verified staging skill: ${(error as Error).message}` };
  } finally {
    if (transactionRoot !== null) rmSync(transactionRoot, { recursive: true, force: true });
    lock.release();
  }
}
