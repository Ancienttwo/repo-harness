import { accessSync, constants, lstatSync, realpathSync, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';

function* piCandidates(env: NodeJS.ProcessEnv): Generator<string> {
  const extensions = process.platform === 'win32' ? (env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';') : [''];
  for (const directory of (env.PATH ?? '').split(delimiter).filter(Boolean)) {
    for (const extension of extensions) yield join(directory, `pi${extension}`);
  }
}

/** Resolve one usable executable identity; an absent or broken installation is unavailable. */
export function piExecutable(env: NodeJS.ProcessEnv = process.env): string | null {
  for (const candidate of piCandidates(env)) {
    try {
      if (!statSync(candidate).isFile()) continue;
      accessSync(candidate, constants.X_OK);
      return realpathSync(candidate);
    } catch { /* Continue through PATH. */ }
  }
  return null;
}

/** Doctor-only explanation for an unavailable Pi installation. */
export function piExecutableIssue(env: NodeJS.ProcessEnv = process.env): 'PI_EXECUTABLE_DANGLING_SYMLINK' | null {
  for (const candidate of piCandidates(env)) {
    try {
      if (!lstatSync(candidate).isSymbolicLink()) continue;
      try { realpathSync(candidate); } catch (error) {
        if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return 'PI_EXECUTABLE_DANGLING_SYMLINK';
      }
    } catch { /* No PATH entry exists. */ }
  }
  return null;
}
