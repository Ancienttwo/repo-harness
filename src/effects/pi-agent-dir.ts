import { join } from 'node:path';

/** Pi expands only a leading home shorthand in its agent directory override. */
export function piAgentDir(home: string, env: Readonly<Record<string, string | undefined>> = process.env): string {
  const directory = env.PI_CODING_AGENT_DIR;
  if (!directory) return join(home, '.pi', 'agent');
  if (directory === '~') return home;
  if (directory.startsWith('~/') || (process.platform === 'win32' && directory.startsWith('~\\'))) return join(home, directory.slice(2));
  return directory;
}
