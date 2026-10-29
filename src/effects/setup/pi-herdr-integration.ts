import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { piAgentDir } from '../pi-agent-dir';

type PiHerdrIntegrationCode =
  | 'PI_HERDR_INTEGRATION_MISSING'
  | 'PI_HERDR_INTEGRATION_OUTDATED'
  | 'PI_HERDR_INTEGRATION_NEEDS_REPAIR'
  | 'PI_HERDR_INTEGRATION_PROBE_FAILED'
  | 'PI_HERDR_INTEGRATION_INVALID_OUTPUT';

export type PiHerdrIntegration =
  | { state: 'current'; detail: string }
  | { state: 'unavailable'; code: PiHerdrIntegrationCode; detail: string };

function unavailable(code: PiHerdrIntegrationCode, detail: string): PiHerdrIntegration {
  return { state: 'unavailable', code, detail: `${code}: ${detail}` };
}

/**
 * Read Herdr's native Pi status and version signal. Its `current` status checks
 * file presence and the version marker, not extension integrity or loadability.
 * This is not dispatch admission. OAR separately checks its exact bundled Pi
 * version when it opens a subprocess session.
 */
export function probePiHerdrIntegration(env: NodeJS.ProcessEnv = process.env): PiHerdrIntegration {
  let agentDir: string;
  try {
    agentDir = piAgentDir(env.HOME || env.USERPROFILE || homedir(), env);
  } catch (error) {
    return unavailable('PI_HERDR_INTEGRATION_PROBE_FAILED', (error as Error).message);
  }
  const result = spawnSync('herdr', ['integration', 'status'], {
    env: { ...env, PI_CODING_AGENT_DIR: agentDir },
    cwd: env.HOME,
    encoding: 'utf8', timeout: 10_000, maxBuffer: 256 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) {
    return unavailable('PI_HERDR_INTEGRATION_PROBE_FAILED',
      `herdr integration status failed (${(result.error as NodeJS.ErrnoException | undefined)?.code ?? result.signal ?? result.status}); Pi agent directory: ${agentDir}`);
  }

  // Herdr 0.9.5 has no JSON status mode. Match its complete Pi row, not a
  // substring or another host's status. Unknown/duplicate rows fail closed.
  const rows = result.stdout.split(/\r?\n/).map(line => line.trim()).filter(line => line.startsWith('pi:'));
  const row = rows[0];
  if (rows.length !== 1 || !row) {
    return unavailable('PI_HERDR_INTEGRATION_INVALID_OUTPUT', 'expected exactly one pi row from herdr integration status');
  }
  if (/^pi: current \(v\d+\) \([^\r\n]+\)$/.test(row)) return { state: 'current', detail: row };
  const code = /^pi: not installed \([^\r\n]+\)$/.test(row) ? 'PI_HERDR_INTEGRATION_MISSING'
    : /^pi: outdated \((?:v\d+|legacy) < v\d+\) \([^\r\n]+\)$/.test(row) ? 'PI_HERDR_INTEGRATION_OUTDATED'
      : /^pi: needs repair \((?:v\d+|legacy)\) \([^\r\n]+\)$/.test(row) ? 'PI_HERDR_INTEGRATION_NEEDS_REPAIR'
        : null;
  if (!code) return unavailable('PI_HERDR_INTEGRATION_INVALID_OUTPUT', 'unrecognized pi row from herdr integration status');
  return unavailable(code, `${row}; explicit user step: herdr integration install pi (Pi agent directory: ${agentDir})`);
}
