import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseRoleNameScalar } from '../terminal/task-role-profiles';

export class ClaudeAgentTypesError extends Error {
  readonly code = 'claude_agent_types_unreadable';
  constructor(message: string) {
    super(message);
    this.name = 'ClaudeAgentTypesError';
  }
}

function readJson(path: string): unknown {
  let raw: string;
  try { raw = readFileSync(path, 'utf8'); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new ClaudeAgentTypesError(`Cannot read ${path}: ${(error as Error).message}`);
  }
  try { return JSON.parse(raw); } catch { throw new ClaudeAgentTypesError(`${path} is not valid JSON.`); }
}

const record = (value: unknown, path: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ClaudeAgentTypesError(`${path} is not a JSON object.`);
  return value as Record<string, unknown>;
};

/** The `name` of each agent file in one directory. A file without a frontmatter `name` defines no agent type. */
function agentNames(directory: string): string[] {
  let files: string[];
  try { files = readdirSync(directory).filter(file => file.endsWith('.md')); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new ClaudeAgentTypesError(`Cannot read ${directory}: ${(error as Error).message}`);
  }
  return files.flatMap((file) => {
    const frontmatter = readFileSync(join(directory, file), 'utf8').replace(/\r\n?/g, '\n').match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
    const name = parseRoleNameScalar(frontmatter?.[1]?.match(/^name:(.*)$/m)?.[1]);
    return name === undefined ? [] : [name];
  });
}

/**
 * The user agent types (`~/.claude/agents`) and the agent types of the enabled
 * plugins (`<plugin>:<name>`), which Claude Code adds to its built-in types.
 * Agents of project settings and of plugin manifests with custom agent paths are not read.
 */
export function claudeHostAgentTypes(env: NodeJS.ProcessEnv = process.env): string[] {
  if (!env.HOME) throw new ClaudeAgentTypesError('HOME is not set.');
  const root = join(env.HOME, '.claude');
  const settingsPath = join(root, 'settings.json');
  const settings = readJson(settingsPath);
  const enabled = settings === undefined ? {} : record(record(settings, settingsPath).enabledPlugins ?? {}, `${settingsPath} enabledPlugins`);
  const registryPath = join(root, 'plugins', 'installed_plugins.json');
  const registry = readJson(registryPath);
  const plugins = registry === undefined ? {} : record(record(registry, registryPath).plugins ?? {}, `${registryPath} plugins`);
  const pluginTypes = Object.entries(plugins).filter(([key]) => enabled[key] === true).flatMap(([key, installs]) => {
    if (!Array.isArray(installs)) throw new ClaudeAgentTypesError(`${registryPath} entry ${key} is not a list.`);
    const plugin = key.split('@')[0]!;
    return installs.flatMap((install) => {
      const path = record(install, `${registryPath} entry ${key}`).installPath;
      if (typeof path !== 'string') throw new ClaudeAgentTypesError(`${registryPath} entry ${key} has no installPath.`);
      return agentNames(join(path, 'agents')).map(name => `${plugin}:${name}`);
    });
  });
  return [...new Set([...agentNames(join(root, 'agents')), ...pluginTypes])].sort();
}
