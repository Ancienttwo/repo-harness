import { accessSync, constants, lstatSync, realpathSync, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';

/** Resolve one executable identity for Pi installation, diagnostics and review. */
export function piExecutable(env: NodeJS.ProcessEnv = process.env): string | null {
  const extensions = process.platform === 'win32' ? (env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';') : [''];
  for (const directory of (env.PATH ?? '').split(delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = join(directory, `pi${extension}`);
      try {
        if (!statSync(candidate).isFile()) continue;
        accessSync(candidate, constants.X_OK);
        return realpathSync(candidate);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT' || code === 'ENOTDIR') {
          let linked = false;
          try { linked = lstatSync(candidate).isSymbolicLink(); } catch { /* No PATH entry exists. */ }
          if (linked) throw new Error('PI_EXECUTABLE_DANGLING_SYMLINK', { cause: error });
        }
      }
    }
  }
  return null;
}
