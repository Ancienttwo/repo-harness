import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join, relative, resolve, sep } from 'path';
import { randomUUID } from 'crypto';
import { deepEqual } from './shared';

export interface ConfigurationRestore {
  path: string;
  selector: string;
  before: string | null;
  installed: string | null;
  active: boolean;
}
export interface ConfigurationReceipt {
  protocol: 1;
  changes: ConfigurationRestore[];
  pending?: { id: string; before: Array<{ path: string; selector: string; value: string | null }> };
}
export const configurationReceiptPath = (env: NodeJS.ProcessEnv = process.env): string =>
  join(env.HOME ?? homedir(), '.repo-harness', 'configuration-restore.json');

/** Only these shared configuration fragments can be restored by an install receipt. */
export function configurationPaths(env: NodeJS.ProcessEnv = process.env): string[] {
  const home = env.HOME ?? homedir();
  return [join(home, '.codex/config.toml'), join(home, '.claude.json'), join(home, '.claude/settings.json')];
}

export function assertConfigurationPath(path: string, env: NodeJS.ProcessEnv = process.env): void {
  const home = resolve(env.HOME ?? homedir());
  const rel = relative(home, resolve(path));
  if (!rel) return;
  if (rel === '..' || rel.startsWith(`..${sep}`) || resolve(path) !== path) throw new Error(`unsafe configuration path: ${path}`);
  let current = home;
  for (const part of rel.split(sep)) {
    current = join(current, part);
    try {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink()) throw new Error(`refusing symlink configuration path: ${current}`);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}

export function writePrivateConfiguration(path: string, content: string, env: NodeJS.ProcessEnv = process.env): void {
  assertConfigurationPath(path, env);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, content, { mode: 0o600, flag: 'wx' });
    renameSync(temp, path);
    chmodSync(path, 0o600);
  } finally { if (existsSync(temp)) unlinkSync(temp); }
}

function jsonObject(raw: string): Record<string, any> {
  const value = JSON.parse(raw || '{}');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('configuration must be a JSON object');
  return value;
}

function validSelector(path: string, selector: string): boolean {
  if (path.endsWith('.toml')) return selector === 'default_mode_request_user_input' || selector === 'mcp_servers.codegraph' || selector === 'mcp_servers.repo_harness';
  return selector === 'mcpServers.codegraph' || selector === 'allowedTools.codegraph';
}

function tomlValue(raw: string, selector: string): unknown {
  const parsed = Bun.TOML.parse(raw) as Record<string, any>;
  return selector === 'default_mode_request_user_input' ? parsed[selector] : parsed.mcp_servers?.[selector.slice(12)];
}

function tomlSpan(raw: string, selector: string): { start: number; end: number } | null {
  if (tomlValue(raw, selector) === undefined) return null;
  const pattern = selector === 'default_mode_request_user_input'
    ? /^default_mode_request_user_input\s*=.*(?:\r?\n|$)/gm
    : new RegExp(`^\\[mcp_servers\\.${selector.slice(12)}\\][^\\S\\r\\n]*(?:\\r?\\n|$)[\\s\\S]*?(?=^\\s*\\[|(?![\\s\\S]))`, 'gm');
  // This selector belongs to the root table. A profile may use the same key.
  // The parsed equality check below rejects misleading text in strings or arrays.
  const tableStart = selector === 'default_mode_request_user_input' ? raw.search(/^[ \t]*\[/m) : -1;
  const source = tableStart === -1 ? raw : raw.slice(0, tableStart);
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) throw new Error(`unsupported TOML spelling for ${selector}; preserving configuration`);
  const match = matches[0]!;
  const span = { start: match.index!, end: match.index! + match[0].length };
  const without = raw.slice(0, span.start) + raw.slice(span.end);
  const expected = Bun.TOML.parse(raw) as Record<string, any>;
  if (selector === 'default_mode_request_user_input') delete expected[selector];
  else { delete expected.mcp_servers[selector.slice(12)]; if (Object.keys(expected.mcp_servers).length === 0) delete expected.mcp_servers; }
  if (!deepEqual(Bun.TOML.parse(without), expected)) throw new Error(`ambiguous TOML fragment ${selector}; preserving configuration`);
  return span;
}

export function readConfigurationFragment(path: string, raw: string, selector: string): string | null {
  if (!validSelector(path, selector)) throw new Error(`invalid configuration selector: ${selector}`);
  if (path.endsWith('.toml')) {
    const span = tomlSpan(raw, selector);
    return span ? raw.slice(span.start, span.end) : null;
  }
  const value = jsonObject(raw);
  if (selector === 'mcpServers.codegraph') return value.mcpServers?.codegraph === undefined ? null : JSON.stringify(value.mcpServers.codegraph);
  if (value.allowedTools !== undefined && !Array.isArray(value.allowedTools)) throw new Error('allowedTools must be an array');
  return value.allowedTools?.includes('mcp__codegraph__*') ? JSON.stringify('mcp__codegraph__*') : null;
}

export function replaceConfigurationFragment(path: string, raw: string, selector: string, value: string | null): string {
  if (!validSelector(path, selector)) throw new Error(`invalid configuration selector: ${selector}`);
  if (path.endsWith('.toml')) {
    const span = tomlSpan(raw, selector);
    const next = span ? raw.slice(0, span.start) + (value ?? '') + raw.slice(span.end)
      : selector === 'default_mode_request_user_input' ? (value ?? '') + raw : raw + (raw.endsWith('\n') || !raw ? '' : '\n') + (value ?? '');
    Bun.TOML.parse(next);
    return next;
  }
  const parsed = jsonObject(raw);
  if (selector === 'mcpServers.codegraph') {
    if (value === null) { if (parsed.mcpServers) { delete parsed.mcpServers.codegraph; if (!Object.keys(parsed.mcpServers).length) delete parsed.mcpServers; } }
    else { parsed.mcpServers ??= {}; parsed.mcpServers.codegraph = JSON.parse(value); }
  } else {
    const entries = parsed.allowedTools ?? [];
    if (!Array.isArray(entries)) throw new Error('allowedTools must be an array');
    parsed.allowedTools = entries.filter((entry: unknown) => entry !== 'mcp__codegraph__*');
    if (value !== null) parsed.allowedTools.push(JSON.parse(value));
    if (!parsed.allowedTools.length) delete parsed.allowedTools;
  }
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

export function readConfigurationReceipt(env: NodeJS.ProcessEnv = process.env): ConfigurationReceipt {
  const path = configurationReceiptPath(env);
  assertConfigurationPath(path, env);
  if (!existsSync(path)) return { protocol: 1, changes: [] };
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const paths = configurationPaths(env);
  const keys = new Set<string>();
  if (raw?.protocol !== 1 || !Array.isArray(raw.changes)) throw new Error(`invalid configuration receipt: ${path}`);
  for (const change of raw.changes) {
    if (!change || !paths.includes(change.path) || typeof change.selector !== 'string' || !validSelector(change.path, change.selector)
      || typeof change.active !== 'boolean'
      || !(change.before === null || typeof change.before === 'string') || !(change.installed === null || typeof change.installed === 'string')) throw new Error(`invalid configuration receipt entry: ${path}`);
    const key = `${change.path}\0${change.selector}`;
    if (keys.has(key)) throw new Error(`duplicate configuration receipt entry: ${path}`);
    keys.add(key);
    for (const value of [change.before, change.installed]) {
      if (value === null) continue;
      if (change.path.endsWith('.toml')) {
        if (readConfigurationFragment(change.path, value, change.selector) !== value) throw new Error('invalid TOML receipt fragment');
      } else JSON.parse(value);
    }
  }
  if (raw.pending !== undefined) {
    if (!raw.pending || typeof raw.pending.id !== 'string' || !Array.isArray(raw.pending.before)
      || raw.pending.before.some((entry: any) => !entry || !paths.includes(entry.path) || typeof entry.selector !== 'string' || !validSelector(entry.path, entry.selector) || !(entry.value === null || typeof entry.value === 'string'))) throw new Error(`invalid pending configuration receipt: ${path}`);
    for (const entry of raw.pending.before) {
      if (entry.value === null) continue;
      if (entry.path.endsWith('.toml')) {
        if (readConfigurationFragment(entry.path, entry.value, entry.selector) !== entry.value) throw new Error('invalid pending TOML fragment');
      } else JSON.parse(entry.value);
    }
  }
  return raw;
}

export function saveConfigurationReceipt(receipt: ConfigurationReceipt, env: NodeJS.ProcessEnv = process.env): void {
  const path = configurationReceiptPath(env);
  if (receipt.changes.length || receipt.pending) writePrivateConfiguration(path, `${JSON.stringify(receipt, null, 2)}\n`, env);
  else { assertConfigurationPath(path, env); if (existsSync(path)) unlinkSync(path); }
}

export function recordConfigurationChange(path: string, before: string, after: string, env: NodeJS.ProcessEnv = process.env, alreadyRecorded = false, pendingId?: string): void {
  if (!configurationPaths(env).includes(path)) return;
  assertConfigurationPath(path, env);
  const receipt = readConfigurationReceipt(env);
  if (receipt.pending && receipt.pending.id !== pendingId) throw new Error(`interrupted configuration transaction; preimage retained at ${configurationReceiptPath(env)}`);
  const selectors = path.endsWith('.toml') ? ['default_mode_request_user_input', 'mcp_servers.codegraph', 'mcp_servers.repo_harness'] : ['mcpServers.codegraph', 'allowedTools.codegraph'];
  for (const selector of selectors) {
    const previous = readConfigurationFragment(path, before, selector);
    const installed = readConfigurationFragment(path, after, selector);
    if (previous === installed) continue;
    const existing = receipt.changes.find((entry) => entry.path === path && entry.selector === selector);
    if (existing?.active && existing.installed !== previous && existing.before !== previous && !(alreadyRecorded && existing.installed === installed)) throw new Error(`configuration changed since installation: ${path} ${selector}`);
    if (existing) {
      if (!existing.active) existing.before = previous;
      existing.installed = installed;
      existing.active = true;
    } else receipt.changes.push({ path, selector, before: previous, installed, active: true });
  }
  saveConfigurationReceipt(receipt, env);
}

export function writeOwnedConfiguration(path: string, content: string, env: NodeJS.ProcessEnv = process.env): void {
  withConfigurationMutation([path], env, () => writePrivateConfiguration(path, content, env));
}

export function captureConfigurationRestores(transaction: { snapshots: readonly { path: string; existed: boolean; backup_path: string | null }[] }, env: NodeJS.ProcessEnv = process.env): void {
  for (const snapshot of transaction.snapshots) {
    if (!configurationPaths(env).includes(snapshot.path)) continue;
    const before = snapshot.existed && snapshot.backup_path ? readFileSync(snapshot.backup_path, 'utf8') : '';
    const after = existsSync(snapshot.path) ? readFileSync(snapshot.path, 'utf8') : '';
    recordConfigurationChange(snapshot.path, before, after, env, true);
  }
}

export function assertRecordedConfigurationCurrent(paths: readonly string[], env: NodeJS.ProcessEnv = process.env): void {
  const receipt = readConfigurationReceipt(env);
  if (receipt.pending) throw new Error(`interrupted configuration transaction; preimage retained at ${configurationReceiptPath(env)}`);
  for (const entry of receipt.changes) {
    if (!entry.active || !paths.includes(entry.path)) continue;
    assertConfigurationPath(entry.path, env);
    const raw = existsSync(entry.path) ? readFileSync(entry.path, 'utf8') : '';
    const current = readConfigurationFragment(entry.path, raw, entry.selector);
    if (current !== entry.installed && current !== entry.before) throw new Error(`configuration changed since installation: ${entry.path} ${entry.selector}`);
  }
}

/** Caller holds the host transaction lock. A killed external writer leaves its preimage durable. */
export function withConfigurationMutation<T>(paths: readonly string[], env: NodeJS.ProcessEnv, mutate: () => T): T {
  assertRecordedConfigurationCurrent(paths, env);
  const receipt = readConfigurationReceipt(env);
  const before = paths.map((path) => {
    if (!configurationPaths(env).includes(path)) throw new Error(`unsupported configuration mutation: ${path}`);
    assertConfigurationPath(path, env);
    return { path, raw: existsSync(path) ? readFileSync(path, 'utf8') : '' };
  });
  const id = randomUUID();
  receipt.pending = { id, before: before.flatMap(({ path, raw }) => (path.endsWith('.toml')
    ? ['default_mode_request_user_input', 'mcp_servers.codegraph', 'mcp_servers.repo_harness'] : ['mcpServers.codegraph', 'allowedTools.codegraph'])
    .map((selector) => ({ path, selector, value: readConfigurationFragment(path, raw, selector) }))) };
  saveConfigurationReceipt(receipt, env);
  const result = mutate();
  for (const snapshot of before) {
    recordConfigurationChange(snapshot.path, snapshot.raw, existsSync(snapshot.path) ? readFileSync(snapshot.path, 'utf8') : '', env, false, id);
  }
  const finalized = readConfigurationReceipt(env);
  if (finalized.pending?.id !== id) throw new Error('configuration transaction ownership changed');
  delete finalized.pending;
  saveConfigurationReceipt(finalized, env);
  return result;
}
