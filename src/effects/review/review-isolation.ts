import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, sep } from 'node:path';

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
  // Default deny-by-complement: all filesystem writes outside the one canonical
  // output tree are denied, including links/traversal once the kernel resolves them.
  // Reads/process/network behavior remains the OS default; this is a write boundary.
  return `(version 1)\n(allow default)\n(deny file-write* (require-not (subpath ${JSON.stringify(output)})))\n`;
}

/** Fixed application host bootstrap only. Native vendor args belong to OAR. */
export function isolatedHostCommand(policyFile: string, node: string, hostEntry: string, specFile: string): readonly string[] {
  for (const path of [policyFile, node, hostEntry, specFile]) if (!isAbsolute(path)) throw new Error('OAR_REVIEW_HOST_PATH_UNSAFE');
  return ['/usr/bin/sandbox-exec', '-f', policyFile, node, hostEntry, specFile];
}
