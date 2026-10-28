import { isAbsolute, join } from 'node:path';

/** Pi expands only a leading home shorthand in its agent directory override. */
export function piAgentDir(home: string, env: Readonly<Record<string, string | undefined>> = process.env): string {
  const configured = env.PI_CODING_AGENT_DIR;
  let directory = configured || join(home, '.pi', 'agent');
  if (directory === '~') directory = home;
  else if (directory.startsWith('~/') || (process.platform === 'win32' && directory.startsWith('~\\'))) directory = join(home, directory.slice(2));
  if (!isAbsolute(directory)) throw new Error('PI_CODING_AGENT_DIR must be an absolute path or use ~/');
  return directory;
}
