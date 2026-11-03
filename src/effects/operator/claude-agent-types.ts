import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import { parseFrontmatter } from '../terminal/task-role-profiles';

export class ClaudeAgentTypesError extends Error {
  readonly code = 'claude_agent_types_unreadable';
  constructor(message: string) {
    super(message);
    this.name = 'ClaudeAgentTypesError';
  }
}

const fail = (path: string, error: unknown) => new ClaudeAgentTypesError(`Cannot read ${path}: ${(error as Error).message}`);
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';

function readText(path: string): string | undefined {
  try { return readFileSync(path, 'utf8'); } catch (error) {
    if (missing(error)) return undefined;
    throw fail(path, error);
  }
}

function readJson(path: string): unknown {
  const raw = readText(path);
  if (raw === undefined) return undefined;
  try { return JSON.parse(raw); } catch { throw new ClaudeAgentTypesError(`${path} is not valid JSON.`); }
}

const record = (value: unknown, path: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ClaudeAgentTypesError(`${path} is not a JSON object.`);
  return value as Record<string, unknown>;
};

/** Every `.md` file under `directory`, at any depth. A missing directory holds no agents. */
function agentFiles(directory: string): string[] {
  let entries;
  try { entries = readdirSync(directory, { withFileTypes: true }); } catch (error) {
    if (missing(error)) return [];
    throw fail(directory, error);
  }
  return entries.flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return agentFiles(path);
    return entry.name.endsWith('.md') ? [path] : [];
  }).sort();
}

/**
 * The frontmatter `name` of one agent file, or `undefined` when the file has no
 * frontmatter or no `name` key. Frontmatter that does not parse, or a `name`
 * that does not parse, fails: the host may still load that file as an agent.
 */
function declaredName(path: string): string | undefined {
  const raw = readText(path);
  if (raw === undefined) throw new ClaudeAgentTypesError(`Cannot read ${path}: the file is gone.`);
  const lines = raw.replace(/^﻿/u, '').replace(/\r\n?/gu, '\n').split('\n');
  if (lines[0] !== '---') return undefined;
  const parsed = parseFrontmatter(raw);
  if (parsed === null) throw new ClaudeAgentTypesError(`${path} has frontmatter that does not parse.`);
  if (parsed.name !== undefined) return parsed.name;
  const close = lines.indexOf('---', 1);
  if (lines.slice(1, close).some(line => /^\s*name:/u.test(line))) throw new ClaudeAgentTypesError(`${path} has a name that does not parse.`);
  return undefined;
}

/**
 * The user agent types and the agent types of the enabled plugins, which Claude
 * Code adds to its built-in types. The root is `CLAUDE_CONFIG_DIR`, or
 * `HOME/.claude`, as for the launched host. Identity rules of Claude Code
 * 2.1.316 (init event probe, #1473): a user agent is its frontmatter `name` at
 * any depth, and a file without one is not an agent. A plugin agent is
 * `<manifest name>:<subfolders>:<name>`, where `name` is the frontmatter `name`
 * or else the file name. Agents of project settings and of plugin manifests
 * with custom agent paths are not read.
 */
export function claudeHostAgentTypes(env: NodeJS.ProcessEnv = process.env): string[] {
  const configured = env.CLAUDE_CONFIG_DIR;
  if (configured === undefined && !env.HOME) throw new ClaudeAgentTypesError('HOME is not set.');
  const root = configured ?? join(env.HOME!, '.claude');
  if (configured !== undefined) {
    try {
      if (!statSync(configured).isDirectory()) throw new ClaudeAgentTypesError(`CLAUDE_CONFIG_DIR ${configured} is not a directory.`);
    } catch (error) {
      throw error instanceof ClaudeAgentTypesError ? error : fail(configured, error);
    }
  }
  const userTypes = agentFiles(join(root, 'agents')).flatMap((path) => {
    const name = declaredName(path);
    return name === undefined ? [] : [name];
  });
  const settingsPath = join(root, 'settings.json');
  const settings = readJson(settingsPath);
  const enabled = settings === undefined ? {} : record(record(settings, settingsPath).enabledPlugins ?? {}, `${settingsPath} enabledPlugins`);
  const registryPath = join(root, 'plugins', 'installed_plugins.json');
  const registry = readJson(registryPath);
  const plugins = registry === undefined ? {} : record(record(registry, registryPath).plugins ?? {}, `${registryPath} plugins`);
  const pluginTypes = Object.entries(plugins).filter(([key]) => enabled[key] === true).flatMap(([key, installs]) => {
    if (!Array.isArray(installs)) throw new ClaudeAgentTypesError(`${registryPath} entry ${key} is not a list.`);
    return installs.flatMap((install) => {
      const installPath = record(install, `${registryPath} entry ${key}`).installPath;
      if (typeof installPath !== 'string') throw new ClaudeAgentTypesError(`${registryPath} entry ${key} has no installPath.`);
      const agentsDirectory = join(installPath, 'agents');
      const files = agentFiles(agentsDirectory);
      if (files.length === 0) return [];
      const manifestPath = join(installPath, '.claude-plugin', 'plugin.json');
      const manifest = readJson(manifestPath);
      const plugin = manifest === undefined ? undefined : record(manifest, manifestPath).name;
      if (typeof plugin !== 'string' || plugin === '') throw new ClaudeAgentTypesError(`${manifestPath} has no plugin name.`);
      return files.map((path) => {
        const folders = relative(agentsDirectory, path).split(sep).slice(0, -1);
        return [plugin, ...folders, declaredName(path) ?? basename(path, '.md')].join(':');
      });
    });
  });
  return [...new Set([...userTypes, ...pluginTypes])].sort();
}
