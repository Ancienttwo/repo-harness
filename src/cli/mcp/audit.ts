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

/** The registered Bot of the tool call in progress; null for an unregistered or unauthenticated caller. */
const auditBot = new AsyncLocalStorage<string | null>();

/**
 * Resolve the OAuth client of one tool call to a registered Bot. Attribution
 * never gates a call: an unreadable registry leaves the call unattributed.
 */
export function mcpAuditBotForClient(clientId: string | undefined, env: NodeJS.ProcessEnv = process.env): string | null {
  if (clientId === undefined) return null;
  try {
    return botIdForMcpClient(readBotRegistry(env), clientId);
  } catch {
    return null;
  }
}

export function runWithMcpAuditBot<T>(botId: string | null, run: () => T): T {
  return auditBot.run(botId, run);
}

export function writeMcpAuditEntry(repoRoot: string, entry: McpAuditEntry): void {
  const safeEntry = {
    ...entry,
    botId: auditBot.getStore() ?? null,
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
