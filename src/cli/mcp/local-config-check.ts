import { existsSync, readFileSync } from 'fs';
import { basename, join } from 'path';
import { repoHarnessHome } from '../../effects/repo-harness-home';
import { mcpLocalConfigPath, parseMcpLocalConfig } from './auth';

/**
 * Read-only preflight on one snapshot of the file. The file holds local paths and
 * the loader's version refusal formats the stored value and a JSON.parse message can
 * quote the file, so those two give a fixed text. The loader's other refusals name a
 * field or a retired key only and pass through.
 */
export function checkMcpLocalConfigFile(env: NodeJS.ProcessEnv): { status: 'ok' | 'skipped' | 'failed'; detail: string } {
  // The home comes from the update's env; the file name stays with the loader's authority.
  const path = join(repoHarnessHome(env), basename(mcpLocalConfigPath()));
  if (!existsSync(path)) return { status: 'skipped', detail: 'No MCP local config.' };
  const refuse = (reason: string) => ({ status: 'failed' as const, detail: `invalid MCP local config at ${path}: ${reason}` });
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return refuse('the file is not valid JSON.');
  }
  try {
    parseMcpLocalConfig(parsed);
    return { status: 'ok', detail: 'MCP local config is valid.' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'the file is refused by the MCP local config loader.';
    return refuse(message.startsWith('unsupported MCP local config version') ? 'unsupported version; set "version": 3.' : message);
  }
}
