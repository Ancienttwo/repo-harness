import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * Compile one test-double source file with Bun into a native executable.
 *
 * Windows CreateProcess cannot start an extensionless shebang script (EFTYPE),
 * so a Windows double must be a real PE file. Production and the positive
 * control spawn one executable path with an argv, so no shell or batch wrapper
 * joins the boundary. Autoloads stay off so the fixture directory cannot change
 * the build.
 */
export function compileNativeTestExecutable(dir: string, name: string, sourcePath: string): string {
  const bin = join(dir, process.platform === 'win32' ? `${name}.exe` : name);
  const build = spawnSync(process.execPath, [
    'build', '--compile',
    '--no-compile-autoload-bunfig', '--no-compile-autoload-dotenv',
    '--no-compile-autoload-tsconfig', '--no-compile-autoload-package-json',
    sourcePath, '--outfile', bin,
  ], { cwd: dir, encoding: 'utf-8', timeout: 60_000 });
  if (build.status !== 0) throw new Error(`${name} compile failed: ${build.stderr || build.stdout}`);
  return bin;
}
