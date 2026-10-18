import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ArchitectureDebtReportV1 } from 'archctx-contracts';
import type { CapabilityOwnership } from '../../core/state/types';
import { checkpointArchitectureDebt, type ArchctxProviderOptions } from '../../effects/architecture/archctx-provider';
import { assertSafeRepoWritePath, writeHookStateFile } from '../../effects/hook-state-file';
import { boundedHookDiagnostic } from './hook-protocol';

const MARKER = '.ai/harness/state/agent-notice';
const COMMAND = 'repo-harness architecture-debt --json';
const MAX_BYTES = 800;
const singleLine = (text: string) => text.replace(/[\r\n\t]+/g, ' ');
const noticeItems = (report: ArchitectureDebtReportV1) => report.items.filter(item => ['unowned-path', 'ambiguous-owner', 'stale-anchor'].includes(item.kind));

export interface AgentNotice {
  readonly content?: string;
  readonly systemMessage?: string;
  readonly diagnostics?: string;
}

/** The checkpoint fallback has no severity or base classification. Only scoped ownership and citation debt reaches this renderer. */
export function renderAgentNotice(report: ArchitectureDebtReportV1): AgentNotice | null {
  const items = noticeItems(report);
  if (items.length === 0) return null;
  const capability = singleLine(items[0]!.capabilityIds[0] ?? report.scope.capabilityIds[0] ?? 'unowned');
  const header = `[ArchitectureDebt] ${items.length} new in ${capability}`;
  const overflow = (count: number) => `(+${count} more: ${COMMAND})`;
  const lines: string[] = [];
  for (const item of items.slice(0, 3)) {
    const field = typeof item.details.modelField === 'string' ? item.details.modelField
      : item.details.origin === 'node-summary' ? 'summary'
      : item.details.origin === 'node-responsibility' ? `responsibilities[${item.details.responsibilityIndex}]`
      : 'human citations';
    const line = `- ${item.kind} ${singleLine(item.capabilityIds[0] ?? capability)}; ${singleLine(field)}. Run: ${singleLine(item.action)}`;
    const remainder = items.length - lines.length - 1;
    const candidate = [header, ...lines, line, ...(remainder > 0 ? [overflow(remainder)] : [])].join('\n');
    if (Buffer.byteLength(candidate, 'utf8') > MAX_BYTES) break;
    lines.push(line);
  }
  const more = items.length - lines.length;
  const content = [header, ...lines, ...(more > 0 ? [overflow(more)] : [])].join('\n');
  // An upstream identifier can exceed the entire budget. Keep the command intact.
  if (Buffer.byteLength(content, 'utf8') > MAX_BYTES) throw new Error('architecture notice identity exceeds the output budget');
  return {
    content,
    systemMessage: `Architecture: ${items.length} debt ${items.length === 1 ? 'item' : 'items'} in ${capability}; run ${COMMAND}.`,
  };
}

/** Shared by all host delivery points. A failure cannot consume the dedupe key. */
export function collectAgentNotice(repoRoot: string, ownership: () => CapabilityOwnership | null, options: ArchctxProviderOptions = {}): AgentNotice {
  try {
    const measured = checkpointArchitectureDebt(repoRoot, ownership(), options);
    if (!measured) return {};
    const notice = renderAgentNotice(measured.report);
    if (!notice) return {};
    const ids = noticeItems(measured.report).map(item => item.id).sort();
    const key = createHash('sha256').update(JSON.stringify([measured.branch, ids])).digest('hex');
    const marker = join(repoRoot, MARKER);
    assertSafeRepoWritePath(repoRoot, marker);
    try { if (readFileSync(marker, 'utf8').trim() === key) return {}; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    execFileSync('git', ['-C', repoRoot, 'check-ignore', '-q', '--', MARKER], { env: options.env ?? process.env, stdio: 'ignore', timeout: 3_000 });
    writeHookStateFile(repoRoot, marker, `${key}\n`);
    return notice;
  } catch (error) {
    const message = singleLine(error instanceof Error ? error.message : String(error));
    return { diagnostics: `${boundedHookDiagnostic(`repo-harness: architecture notice unavailable: ${message}`)}\n` };
  }
}
