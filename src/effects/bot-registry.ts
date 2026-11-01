// Account-level Bot registry (PRD G30): one `<home>/bots/<bot-id>.json` per
// Bot. A record names the Bot and its Slack bot and Herdr agent so that task
// messages and Herdr panes can be attributed.
// A record grants nothing: MCP profiles, repository access modes and
// admission stay the only authority.

import { lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'fs';
import { join } from 'path';
import { withExclusiveDirectoryLock } from './locking/exclusive-directory-lock';
import { repoHarnessHome } from './repo-harness-home';

export const BOT_RECORD_PROTOCOL = 1 as const;
export const BOT_RECORD_KIND = 'repo-harness-bot' as const;
export const BOT_REGISTRY_DIRECTORY = 'bots';
const BOT_REGISTRY_LOCK = 'bots.lock';
const BOT_RECORD_MAX_BYTES = 16 * 1024;
export const BOT_REGISTRY_MAX_RECORDS = 256;

const BOT_ID = /^[a-z][a-z0-9-]{0,62}$/;
const BOT_HOST = /^[A-Za-z][A-Za-z0-9._-]{0,31}$/;
const SLACK_BOT_ID = /^[A-Z][A-Z0-9]{2,31}$/;
const HERDR_AGENT = /^[a-z][a-z0-9_-]{0,31}$/;
const TIMESTAMP = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const RECORD_FIELDS = ['bot_id', 'herdr_agent', 'host', 'kind', 'name', 'protocol', 'registered_at', 'slack_bot_id'];

export interface BotRecordV1 {
  readonly protocol: typeof BOT_RECORD_PROTOCOL;
  readonly kind: typeof BOT_RECORD_KIND;
  readonly bot_id: string;
  readonly name: string;
  readonly host: string;
  readonly slack_bot_id: string | null;
  readonly herdr_agent: string | null;
  readonly registered_at: string;
}

export type BotRegistryErrorCode = 'bot_invalid' | 'bot_exists' | 'bot_conflict' | 'bot_registry_full' | 'bot_registry_invalid';

export class BotRegistryError extends Error {
  constructor(readonly code: BotRegistryErrorCode, message: string) {
    super(message);
    this.name = 'BotRegistryError';
  }
}

function invalid(message: string): never {
  throw new BotRegistryError('bot_invalid', message);
}

function nullable(value: unknown, grammar: RegExp, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !grammar.test(value)) invalid(`${field} is invalid`);
  return value;
}

export function validateBotRecord(value: unknown): BotRecordV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('bot record must be an object');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join() !== RECORD_FIELDS.join()) invalid('bot record fields are invalid');
  if (record.protocol !== BOT_RECORD_PROTOCOL || record.kind !== BOT_RECORD_KIND) invalid('bot record protocol or kind is invalid');
  if (typeof record.bot_id !== 'string' || !BOT_ID.test(record.bot_id)) invalid('bot_id must match [a-z][a-z0-9-]{0,62}');
  const name = record.name;
  if (typeof name !== 'string' || name.trim() !== name || name.length === 0 || name.length > 64 || /[\x00-\x1f\x7f]/.test(name)) {
    invalid('name must be 1-64 printable characters without surrounding spaces');
  }
  if (typeof record.host !== 'string' || !BOT_HOST.test(record.host)) invalid('host is invalid');
  if (typeof record.registered_at !== 'string' || !TIMESTAMP.test(record.registered_at) || new Date(record.registered_at).toISOString() !== record.registered_at) {
    invalid('registered_at is invalid');
  }
  return Object.freeze({
    protocol: BOT_RECORD_PROTOCOL,
    kind: BOT_RECORD_KIND,
    bot_id: record.bot_id,
    name,
    host: record.host,
    slack_bot_id: nullable(record.slack_bot_id, SLACK_BOT_ID, 'slack_bot_id'),
    herdr_agent: nullable(record.herdr_agent, HERDR_AGENT, 'herdr_agent'),
    registered_at: record.registered_at,
  });
}

export function botRegistryPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(repoHarnessHome(env), BOT_REGISTRY_DIRECTORY);
}

/** Each external identity names at most one Bot; otherwise attribution would be ambiguous. */
function assertUniqueIdentities(bots: readonly BotRecordV1[], code: 'bot_conflict' | 'bot_registry_invalid'): void {
  for (const field of ['slack_bot_id', 'herdr_agent'] as const) {
    const owners = new Map<string, string>();
    for (const bot of bots) {
      const value = bot[field];
      if (value === null) continue;
      const owner = owners.get(value);
      if (owner !== undefined) throw new BotRegistryError(code, `${field} is already registered to bot ${owner}`);
      owners.set(value, bot.bot_id);
    }
  }
}

/**
 * Strict read of every record. A malformed file, a file whose name differs
 * from its bot_id, or a shared external identity fails the whole read: an
 * attribution from a partial registry could name the wrong Bot.
 */
export function readBotRegistry(env: NodeJS.ProcessEnv = process.env): readonly BotRecordV1[] {
  const directory = botRegistryPath(env);
  let names: string[];
  try {
    if (!lstatSync(directory).isDirectory()) throw new BotRegistryError('bot_registry_invalid', 'bot registry is not a directory');
    names = readdirSync(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return Object.freeze([]);
    if (error instanceof BotRegistryError) throw error;
    throw new BotRegistryError('bot_registry_invalid', 'bot registry is unreadable');
  }
  const files = names.filter(name => !name.startsWith('.')).sort();
  if (files.length > BOT_REGISTRY_MAX_RECORDS) throw new BotRegistryError('bot_registry_invalid', 'bot registry has too many entries');
  const bots = files.map((name) => {
    const path = join(directory, name);
    try {
      const stat = lstatSync(path);
      if (!name.endsWith('.json') || !stat.isFile() || stat.size > BOT_RECORD_MAX_BYTES) throw new Error('entry');
      const bot = validateBotRecord(JSON.parse(readFileSync(path, 'utf8')));
      if (`${bot.bot_id}.json` !== name) throw new Error('name');
      return bot;
    } catch {
      throw new BotRegistryError('bot_registry_invalid', `bot registry entry ${JSON.stringify(name)} is invalid`);
    }
  });
  assertUniqueIdentities(bots, 'bot_registry_invalid');
  return Object.freeze(bots);
}

export interface RegisterBotInput {
  readonly bot_id: string;
  readonly name: string;
  readonly host: string;
  readonly slack_bot_id?: string | null;
  readonly herdr_agent?: string | null;
  /** Replace an existing record with the same bot_id. Without it, an existing record is an error. */
  readonly replace?: boolean;
  readonly now?: Date;
}

export function registerBot(input: RegisterBotInput, env: NodeJS.ProcessEnv = process.env): BotRecordV1 {
  const bot = validateBotRecord({
    protocol: BOT_RECORD_PROTOCOL,
    kind: BOT_RECORD_KIND,
    bot_id: input.bot_id,
    name: input.name,
    host: input.host,
    slack_bot_id: input.slack_bot_id ?? null,
    herdr_agent: input.herdr_agent ?? null,
    registered_at: (input.now ?? new Date()).toISOString(),
  });
  const home = repoHarnessHome(env);
  mkdirSync(join(home, BOT_REGISTRY_DIRECTORY), { recursive: true, mode: 0o700 });
  return withExclusiveDirectoryLock(realpathSync(home), BOT_REGISTRY_LOCK, () => {
    const existing = readBotRegistry(env);
    const known = existing.some(entry => entry.bot_id === bot.bot_id);
    if (known && input.replace !== true) {
      throw new BotRegistryError('bot_exists', `bot ${bot.bot_id} is already registered; pass --replace to overwrite it`);
    }
    // The read refuses a registry above the cap, so a new record past it would break every reader.
    if (!known && existing.length >= BOT_REGISTRY_MAX_RECORDS) {
      throw new BotRegistryError('bot_registry_full', `the bot registry already holds ${BOT_REGISTRY_MAX_RECORDS} bots`);
    }
    assertUniqueIdentities([...existing.filter(entry => entry.bot_id !== bot.bot_id), bot], 'bot_conflict');
    const path = join(botRegistryPath(env), `${bot.bot_id}.json`);
    const temporary = join(botRegistryPath(env), `.${bot.bot_id}.json.${process.pid}.${Date.now()}.tmp`);
    writeFileSync(temporary, `${JSON.stringify(bot, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    renameSync(temporary, path);
    return bot;
  }, { waitTimeoutMs: 10_000, reclaimStaleEmptyDirectory: true });
}
