// A Pi seat runs its bash tool in the shell that Pi selects (#2370). In /bin/bash 3.2 an unbalanced `)` in a heredoc body
// inside `$(...)` ends the substitution, and a backtick span after it runs. The launch refuses on such a shell.
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

const PROBE_SCRIPT = [
  'x="$(cat <<\'EOF\'',
  'a smile :)',
  'then a span `echo INJECTED-BY-BACKTICK`',
  'EOF',
  ')"',
  'printf \'RESULT[%s]\\n\' "$x"',
].join('\n');
const PROBE_OUTPUT = 'RESULT[a smile :)\nthen a span `echo INJECTED-BY-BACKTICK`]\n';
const PROBE_TIMEOUT_MS = 5000;
const FIX = 'Set shellPath in ~/.pi/agent/settings.json to a bash 4 or newer (for example /opt/homebrew/bin/bash).';

export class PiShellError extends Error {
  constructor(readonly code: 'pi_shell_refused' | 'pi_shell_probe_failed', message: string) {
    super(message);
  }
}

/** `shellPath` of one Pi settings file: undefined when the file or the key is absent. An empty string is a value: Pi's merge keeps it over the global one. */
function settingsShellPath(file: string): string | undefined {
  let text: string;
  try { text = readFileSync(file, 'utf8'); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new PiShellError('pi_shell_refused', `Pi settings ${file} cannot be read: ${(error as Error).message} ${FIX}`);
  }
  let value: unknown;
  try { value = (JSON.parse(text) as { shellPath?: unknown }).shellPath; } catch {
    throw new PiShellError('pi_shell_refused', `Pi settings ${file} is not valid JSON. ${FIX}`);
  }
  if (typeof value !== 'string') return undefined;
  return value === '' ? value : absolute(value, `shellPath of ${file}`);
}

/** The check expands no `~`: a value that is not absolute is refused, so the check never differs from Pi on a path form. */
function absolute(value: string, source: string): string {
  if (!isAbsolute(value)) throw new PiShellError('pi_shell_refused', `${source} is "${value}", which is not an absolute path. Set an absolute path.`);
  return value;
}

/** The shell that a Pi seat uses: `shellPath` of the project settings, else of the global settings, else `/bin/bash` on a non-Windows host. Any other case is a refusal. */
function piShell(env: NodeJS.ProcessEnv, cwd: string, defaultShell: string): string {
  // The default agent directory under the home directory is the only path that this check builds.
  const agentDirectory = env.PI_CODING_AGENT_DIR ? absolute(env.PI_CODING_AGENT_DIR, 'PI_CODING_AGENT_DIR') : join(env.HOME ?? homedir(), '.pi', 'agent');
  const configured = settingsShellPath(join(cwd, '.pi', 'settings.json')) ?? settingsShellPath(join(agentDirectory, 'settings.json'));
  if (configured) return configured;
  if (process.platform !== 'win32' && existsSync(defaultShell)) return defaultShell;
  throw new PiShellError('pi_shell_refused', `No shell is known for the Pi seat: shellPath is not set and /bin/bash is not available. ${FIX}`);
}

/** Refuses a Pi seat launch when the shell that Pi will use fails the heredoc probe. */
/** `defaultShell` is Pi's own default on a non-Windows host; a test passes a stub. */
export async function assertPiShell(env: NodeJS.ProcessEnv, cwd: string, defaultShell = '/bin/bash'): Promise<void> {
  const shell = piShell(env, cwd, defaultShell);
  const output = await new Promise<string>((resolve, reject) => {
    execFile(shell, ['-c', PROBE_SCRIPT], { timeout: PROBE_TIMEOUT_MS, encoding: 'utf8' }, (error, stdout) => {
      if (error === null || typeof (error as NodeJS.ErrnoException).code === 'number') return resolve(stdout);
      reject(new PiShellError('pi_shell_probe_failed', `The shell probe of ${shell} did not finish: ${error.message}`));
    });
  });
  if (output !== PROBE_OUTPUT) {
    throw new PiShellError('pi_shell_refused', `The shell ${shell} runs a backtick span in a heredoc body (bash 3.2). ${FIX}`);
  }
}
