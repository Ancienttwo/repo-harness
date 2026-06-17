import { createHash } from 'crypto';
import { appendFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { redactMcpText } from './redaction';
import type { McpAuditEntry } from './types';

export function hashMcpInput(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function mcpAuditLogPath(repoRoot: string): string {
  return join(repoRoot, '.ai', 'harness', 'mcp', 'audit.log');
}

export function writeMcpAuditEntry(repoRoot: string, entry: McpAuditEntry): void {
  const logPath = mcpAuditLogPath(repoRoot);
  mkdirSync(dirname(logPath), { recursive: true });
  const safeEntry = {
    ...entry,
    error: entry.error ? redactMcpText(entry.error).text : undefined,
  };
  appendFileSync(logPath, `${JSON.stringify(safeEntry)}\n`, 'utf-8');
}

export function tryWriteMcpAuditEntry(repoRoot: string, entry: McpAuditEntry): boolean {
  try {
    writeMcpAuditEntry(repoRoot, entry);
    return true;
  } catch (_error) {
    return false;
  }
}
