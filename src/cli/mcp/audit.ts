import { createHash } from 'crypto';
import { join } from 'path';
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

export function writeMcpAuditEntry(repoRoot: string, entry: McpAuditEntry): void {
  const safeEntry = {
    ...entry,
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
