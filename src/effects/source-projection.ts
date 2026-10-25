import { createHash, randomUUID } from "crypto";
import {
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "path";

export type ProjectionFileMode = "100644" | "100755";

export type ProjectionFileRecord = {
  relPath: string;
  bytes: Buffer;
  mode: ProjectionFileMode;
};

export function toPosixPath(path: string): string {
  return path.split(sep).join("/");
}

export function assertSafeProjectionPath(relPath: string, field: string): void {
  if (!relPath || relPath.startsWith("/") || relPath.includes("\\")) {
    throw new Error(`${field} contains invalid path: ${relPath}`);
  }

  const parts = relPath.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`${field} contains unsafe path segment: ${relPath}`);
  }
}

function isContained(root: string, candidate: string): boolean {
  const relPath = relative(root, candidate);
  return relPath === "" || (!relPath.startsWith(`..${sep}`) && relPath !== ".." && !isAbsolute(relPath));
}

function validateProjectionRoot(root: string): { absolute: string; canonical: string } {
  const absolute = resolve(root);
  const stat = lstatSync(absolute);
  if (stat.isSymbolicLink()) {
    throw new Error(`projection root must not be a symlink: ${root}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`projection root is not a directory: ${root}`);
  }
  return { absolute, canonical: realpathSync(absolute) };
}

function assertContainedProjectionPath(root: string, candidate: string): void {
  if (!isContained(root, candidate) || candidate === root) {
    throw new Error(`projection path escapes root: ${candidate}`);
  }
}

function validateExistingProjectionPath(
  root: { absolute: string; canonical: string },
  candidate: string,
  expected: "directory" | "file",
): void {
  assertContainedProjectionPath(root.absolute, candidate);
  const relPath = relative(root.absolute, candidate);
  let current = root.absolute;
  const parts = relPath.split(sep);

  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) {
      throw new Error(`symlink is not allowed in projection path: ${current}`);
    }
    const isFinal = index === parts.length - 1;
    if (!isFinal && !stat.isDirectory()) {
      throw new Error(`projection path parent is not a directory: ${current}`);
    }
    if (isFinal && expected === "directory" && !stat.isDirectory()) {
      throw new Error(`projection path is not a directory: ${current}`);
    }
    if (isFinal && expected === "file" && !stat.isFile()) {
      throw new Error(`projection path is not a file: ${current}`);
    }
  }

  const canonical = realpathSync(candidate);
  if (!isContained(root.canonical, canonical) || canonical === root.canonical) {
    throw new Error(`canonical projection path escapes root: ${candidate}`);
  }
}

function ensureProjectionParent(root: { absolute: string; canonical: string }, parent: string): void {
  if (parent === root.absolute) return;
  assertContainedProjectionPath(root.absolute, parent);
  const relPath = relative(root.absolute, parent);
  let current = root.absolute;

  for (const part of relPath.split(sep)) {
    current = join(current, part);
    if (!existsSync(current)) mkdirSync(current);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) {
      throw new Error(`symlink is not allowed in projection parent: ${current}`);
    }
    if (!stat.isDirectory()) {
      throw new Error(`projection parent is not a directory: ${current}`);
    }
  }

  const canonicalParent = realpathSync(parent);
  if (!isContained(root.canonical, canonicalParent)) {
    throw new Error(`canonical projection parent escapes root: ${parent}`);
  }
}

export function normalizedProjectionMode(absPath: string): ProjectionFileMode {
  return (lstatSync(absPath).mode & 0o111) === 0 ? "100644" : "100755";
}

export function projectionModeToPerm(mode: ProjectionFileMode): number {
  return mode === "100755" ? 0o755 : 0o644;
}

export function readProjectionFile(root: string, relPath: string): ProjectionFileRecord {
  assertSafeProjectionPath(relPath, "projection path");
  const validatedRoot = validateProjectionRoot(root);
  const absPath = resolve(validatedRoot.absolute, relPath);
  validateExistingProjectionPath(validatedRoot, absPath, "file");

  const bytes = readFileSync(absPath);
  return {
    relPath,
    bytes,
    mode: normalizedProjectionMode(absPath),
  };
}

export function collectProjectionFiles(root: string): ProjectionFileRecord[] {
  const validatedRoot = validateProjectionRoot(root);

  function collect(current: string): ProjectionFileRecord[] {
    const entries = readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
    const files: ProjectionFileRecord[] = [];

    for (const entry of entries) {
      const absPath = join(current, entry.name);
      const relPath = toPosixPath(relative(validatedRoot.absolute, absPath));
      if (entry.isSymbolicLink()) {
        throw new Error(`symlink is not allowed in source projection: ${relPath}`);
      }
      if (entry.isDirectory()) {
        validateExistingProjectionPath(validatedRoot, absPath, "directory");
        files.push(...collect(absPath));
        continue;
      }
      if (entry.isFile()) files.push(readProjectionFile(validatedRoot.absolute, relPath));
    }

    return files;
  }

  return collect(validatedRoot.absolute);
}

export function digestProjectionFiles(files: readonly ProjectionFileRecord[]): string {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file.relPath);
    hash.update("\0");
    hash.update(file.mode);
    hash.update("\0");
    hash.update(file.bytes);
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

export function sameProjectionBytes(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && a.equals(b);
}

export function writeProjectionFileAtomic(
  repoRoot: string,
  absPath: string,
  bytes: Buffer | string,
  mode: ProjectionFileMode,
): void {
  const validatedRoot = validateProjectionRoot(repoRoot);
  if (!isAbsolute(absPath)) {
    throw new Error(`projection write target must be absolute: ${absPath}`);
  }
  const target = resolve(absPath);
  assertContainedProjectionPath(validatedRoot.absolute, target);
  const parent = dirname(target);
  ensureProjectionParent(validatedRoot, parent);
  if (existsSync(target)) validateExistingProjectionPath(validatedRoot, target, "file");

  const tmp = join(parent, `.${basename(target)}.${process.pid}.${randomUUID()}.tmp`);
  let fd: number | undefined;
  try {
    fd = openSync(
      tmp,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      projectionModeToPerm(mode),
    );
    writeFileSync(fd, bytes);
    fchmodSync(fd, projectionModeToPerm(mode));
    closeSync(fd);
    fd = undefined;

    ensureProjectionParent(validatedRoot, parent);
    if (existsSync(target)) validateExistingProjectionPath(validatedRoot, target, "file");
    renameSync(tmp, target);
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    rmSync(tmp, { force: true });
    throw error;
  }
}
