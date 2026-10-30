import { AsyncLocalStorage } from 'async_hooks';
import { createHash } from 'crypto';
import { join } from 'path';
import { botIdForMcpClient, readBotRegistry } from '../../effects/bot-registry';
import { appendSegmentedLog } from '../../effects/segmented-log';
import { redactMcpText } from './redaction';
import type { McpAuditEntry } from './types';

export function hashMcpInput(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export const MCP_AUDIT_LOG_RELATIVE_PATH = '.ai/harness/mcp/audit.log';

export function mcpAuditLogPath(repoRoot: string): string {
  return join(repoRoot, MCP_AUDIT_LOG_RELATIVE_PATH);
}

/**
 * The Bot of one tool call. `resolved` with a null id is a caller that names
 * no registered Bot; `unavailable` means the registry could not be read, so
 * the Bot is unknown rather than unregistered.
 */
export type McpAuditBot = { readonly state: 'resolved'; readonly botId: string | null } | { readonly state: 'unavailable' };

const auditBot = new AsyncLocalStorage<McpAuditBot>();
/** The verified OAuth client of each call context. Only the transport's auth info writes it, never tool arguments. */
const oauthClientOf = new WeakMap<McpAuditBot, string>();

export const MCP_ACTOR_UNAVAILABLE = 'actor_unavailable';

/** Resolve the OAuth client of one tool call to a registered Bot. Attribution never gates a call. */
export function mcpAuditBotForClient(clientId: string | undefined, env: NodeJS.ProcessEnv = process.env): McpAuditBot {
  if (clientId === undefined) return { state: 'resolved', botId: null };
  let bot: McpAuditBot;
  try {
    bot = { state: 'resolved', botId: botIdForMcpClient(readBotRegistry(env), clientId) };
  } catch {
    bot = { state: 'unavailable' };
  }
  oauthClientOf.set(bot, clientId);
  return bot;
}

/** The OAuth client of the current tool call, or `actor_unavailable` when the call carries no OAuth identity. */
export function currentMcpActor(): string {
  const bot = auditBot.getStore();
  return (bot && oauthClientOf.get(bot)) ?? MCP_ACTOR_UNAVAILABLE;
}

export function runWithMcpAuditBot<T>(bot: McpAuditBot, run: () => T): T {
  return auditBot.run(bot, run);
}

export function writeMcpAuditEntry(repoRoot: string, entry: McpAuditEntry): void {
  const bot = auditBot.getStore() ?? { state: 'resolved', botId: null };
  const safeEntry = {
    ...entry,
    botId: bot.state === 'resolved' ? bot.botId : null,
    // Only a failed lookup writes this marker; the projection then shows the Bot as unavailable, not unregistered.
    ...(bot.state === 'unavailable' ? { botLookup: 'unavailable' as const } : {}),
    error: entry.error ? redactMcpText(entry.error).text : undefined,
  };
  appendSegmentedLog(mcpAuditLogPath(repoRoot), `${JSON.stringify(safeEntry)}\n`, repoRoot);
}

export function tryWriteMcpAuditEntry(repoRoot: string, entry: McpAuditEntry): boolean {
  try {
    writeMcpAuditEntry(repoRoot, entry);
    return true;
  } catch (_error) {
    return false;
  }
}
