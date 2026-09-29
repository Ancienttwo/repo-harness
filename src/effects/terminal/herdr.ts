import { spawnSync, type SpawnSyncReturns } from 'child_process';
import { dirname, isAbsolute, join } from 'path';
import { userInfo } from 'os';

export const HERDR_COMMAND_TIMEOUT_MS = 10_000;
export interface HerdrEndpoint { readonly session: string; readonly configPath?: string; readonly home?: string }
export type HerdrSpawn = (command: string, args: readonly string[], options: {
  readonly timeout: number; readonly env: NodeJS.ProcessEnv;
}) => SpawnSyncReturns<Buffer>;

export function herdrEnvironment(endpoint: HerdrEndpoint): NodeJS.ProcessEnv {
  if (typeof endpoint.session !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(endpoint.session)) throw new Error('herdr_invalid_session');
  const env = { ...process.env };
  // A CLI launched from another pane must never inherit its socket or caller identity.
  for (const name of Object.keys(env)) if (name.startsWith('HERDR_')) delete env[name];
  if (endpoint.configPath !== undefined) {
    if (typeof endpoint.configPath !== 'string' || !isAbsolute(endpoint.configPath)) throw new Error('herdr_invalid_config_path');
    env.HERDR_CONFIG_PATH = endpoint.configPath;
  }
  if (endpoint.home !== undefined) {
    if (!isAbsolute(endpoint.home)) throw new Error('herdr_invalid_home');
    env.HOME = endpoint.home;
    env.XDG_CONFIG_HOME = join(endpoint.home, '.config');
  }
  return env;
}

export const spawnHerdr: HerdrSpawn = (command, args, options) => spawnSync(command, [...args], {
  ...options, killSignal: 'SIGKILL', shell: false, encoding: null, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
});

export function herdrCommand(endpoint: HerdrEndpoint, args: readonly string[], bin = 'herdr', spawn: HerdrSpawn = spawnHerdr, timeoutMs = HERDR_COMMAND_TIMEOUT_MS) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error('herdr_invalid_command_timeout');
  return spawn(bin, ['--session', endpoint.session, ...args], { timeout: timeoutMs, env: herdrEnvironment(endpoint) });
}

export function herdrResult(result: SpawnSyncReturns<Buffer>): Record<string, any> {
  if (result.error || result.status !== 0 || result.signal) throw new Error('herdr_command_failed');
  const response = JSON.parse(result.stdout.toString('utf8'));
  if (!response || typeof response.id !== 'string' || response.error || !response.result || typeof response.result !== 'object') throw new Error('herdr_invalid_response');
  return response.result;
}

/** Herdr's documented named-session directory; validate before any side effect. */
export function validateHerdrEndpoint(endpoint: HerdrEndpoint): string {
  const env = herdrEnvironment(endpoint);
  const base = env.XDG_CONFIG_HOME || join(env.HOME || userInfo().homedir, '.config');
  const socket = endpoint.session === 'default'
    ? join(base, 'herdr', 'herdr.sock')
    : join(base, 'herdr', 'sessions', endpoint.session, 'herdr.sock');
  // sun_path includes its trailing NUL; macOS 104, Linux 108 bytes.
  const capacity = process.platform === 'darwin' ? 103 : process.platform === 'linux' ? 107 : 0;
  if (!capacity) throw new Error('herdr_endpoint_platform_unsupported');
  // v0.9.1 src/session.rs: both API and client listeners are created by server.
  const clientSocket = join(dirname(socket), 'herdr-client.sock');
  for (const path of [socket, clientSocket]) {
    if (!isAbsolute(path) || Buffer.byteLength(path) > capacity) {
      throw new Error(`herdr_endpoint_path_too_long: ${Buffer.byteLength(path)} bytes; maximum ${capacity}`);
    }
  }
  return socket;
}

export function herdrMutation(result: SpawnSyncReturns<Buffer>): void {
  if (result.error || result.status !== 0 || result.signal) throw new Error('herdr_command_failed');
  // Mutation commands may intentionally have no stdout; getters still require JSON.
  if (result.stdout.length) herdrResult(result);
}
