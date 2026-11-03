import { runSessionObservationGit as git, refuseSessionObservation as refuse } from '../sessions/admitted-source';

/** The effective `filter.<driver>.clean` and `.process` commands, by config key; the last value of a key wins. */
export function effectiveFilterCommands(cwd: string, run: typeof git = git): Map<string, string> {
  const output = run(cwd, ['config', '--includes', '--null', '--get-regexp', '^filter\\..*\\.(clean|process)$'], true);
  const effective = new Map<string, string>();
  if (!output) return effective;
  if (!output.endsWith('\0')) return refuse('unavailable');
  for (const record of output.slice(0, -1).split('\0')) {
    const separator = record.indexOf('\n');
    if (separator < 1) return refuse('unavailable');
    effective.set(record.slice(0, separator), record.slice(separator + 1));
  }
  return effective;
}

// Git omits worktree checks for assume-unchanged (lowercase tag) and
// skip-worktree (`S`) entries; never label that an empty diff.
export function refuseHiddenWorktreeEntries(cwd: string, run: typeof git = git): void {
  const entries = run(cwd, ['ls-files', '-v', '-z']);
  if (entries && !entries.endsWith('\0')) return refuse('unavailable');
  if (entries.split('\0').some(entry => /^[a-zS] /.test(entry))) return refuse('index_unsupported');
}
