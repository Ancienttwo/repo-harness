#!/usr/bin/env bun
/** Git is the authority: NUL-delimited paths, with rename detection disabled. */
import { execFileSync } from 'node:child_process';
import { protectedRepoDir, PROTECTED_REPO_DIRS } from '../src/cli/hook/mutation-protected-dirs';

export function checkProtectedPaths(args: readonly string[], cwd = process.cwd(), env = process.env): number {
  if (args.length > 1 || (args.length === 1 && !['--staged', '--tracked'].includes(args[0]!))) {
    process.stderr.write('Usage: repo-harness run check-protected-paths [--staged|--tracked]\n');
    return 2;
  }
  try {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const gitArgs = args[0] === '--tracked'
      ? ['--literal-pathspecs', 'ls-files', '--cached', '--full-name', '-z', '--', ...PROTECTED_REPO_DIRS]
      : ['--literal-pathspecs', '-c', 'diff.relative=false', 'diff', '--cached', '--name-only', '--no-renames', '-z', '--', ...PROTECTED_REPO_DIRS];
    const output = execFileSync('git', gitArgs, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5_000 });
    const paths = output.split('\0').filter(path => protectedRepoDir(path));
    if (!paths.length) return 0;
    if (env.REPO_HARNESS_ALLOW_PROTECTED_PATHS === '1') {
      process.stderr.write('[ProtectedGitPaths] Explicit override REPO_HARNESS_ALLOW_PROTECTED_PATHS=1 permits protected paths.\n');
      return 0;
    }
    process.stderr.write(`[ProtectedGitPaths] Refused ${args[0] === '--tracked' ? 'tracked' : 'staged'} paths:\n${paths.map(path => `- ${JSON.stringify(path)}`).join('\n')}\nKeep _ops/ and _ref/ private and ignored. Only a human-approved operation may set REPO_HARNESS_ALLOW_PROTECTED_PATHS=1 for this command.\n`);
    return 1;
  } catch {
    process.stderr.write('[ProtectedGitPaths] Git path inspection failed. No path clearance was established.\n');
    return 2;
  }
}

if (import.meta.main) process.exit(checkProtectedPaths(process.argv.slice(2)));
