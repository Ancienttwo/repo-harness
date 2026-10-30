import { resolve } from 'node:path';
import { Command } from 'commander';
import { TASK_INBOX_V2_RELATIVE_PATH } from '../../core/fleet/task-inbox-layout';
import { RETENTION_CLASSES, runArtifactRetention, type RetentionConfig, type RetentionReport } from '../../effects/artifact-retention';
import { gitExecFileSync } from '../../effects/git/runner';
import { INTEGRATION_EVIDENCE_ROOT_RELATIVE_PATH } from '../../effects/integration/product-acceptance';
import { FEEDBACK_ROOT_RELATIVE_PATH } from '../../effects/publication/feedback-store';
import { SEGMENTED_LOG_ARCHIVE_BYTES, SEGMENTED_LOG_ARCHIVE_SEGMENTS, SEGMENTED_LOG_SEGMENT_BYTES } from '../../effects/segmented-log';
import { HOOK_EVENT_TELEMETRY_PATH } from '../hook/event-telemetry';
import { MCP_AUDIT_LOG_RELATIVE_PATH } from '../mcp/audit';
import { MCP_INDEX_EVENTS_RELATIVE_PATH, MCP_METRICS_RELATIVE_PATH, MCP_TRACE_RELATIVE_PATH } from '../mcp/general-repo-access';
import { UPGRADE_AUDIT_MAX_RECORDS } from './upgrade';

interface RetentionCommandOptions {
  repo?: string;
  apply?: boolean;
  json?: boolean;
}

export type RetentionRootRule = 'archive' | 'delete' | 'rotate' | 'keep';

export interface RetentionRoot {
  /** Repo-relative, `{common}/` for the Git common directory, or `~/.repo-harness/` for the user state root. */
  readonly path: string;
  readonly rule: RetentionRootRule;
  readonly detail: string;
}

const MIB = 1024 * 1024;

/** Every harness storage root that grows without a user action, and what bounds it. */
export function retentionRoots(config: RetentionConfig): RetentionRoot[] {
  const rotation = `the writer rotates at ${SEGMENTED_LOG_SEGMENT_BYTES / MIB} MiB and keeps ${SEGMENTED_LOG_ARCHIVE_SEGMENTS} segments up to ${SEGMENTED_LOG_ARCHIVE_BYTES / MIB} MiB`;
  const noRule = 'kept: protocol records have no reclamation rule yet (#918)';
  return [
    ...RETENTION_CLASSES.map((retentionClass): RetentionRoot => ({
      path: retentionClass.dir,
      rule: 'archive',
      detail: `${retentionClass.id} move to ${config.archiveRoot} after ${config.days} days`,
    })),
    { path: config.archiveRoot, rule: 'delete', detail: `archived entries are deleted ${config.archiveDays} days after their newest write` },
    ...[HOOK_EVENT_TELEMETRY_PATH, MCP_INDEX_EVENTS_RELATIVE_PATH, MCP_METRICS_RELATIVE_PATH, MCP_TRACE_RELATIVE_PATH, MCP_AUDIT_LOG_RELATIVE_PATH]
      .map((path): RetentionRoot => ({ path, rule: 'rotate', detail: rotation })),
    { path: '~/.repo-harness/packages', rule: 'rotate', detail: 'install keeps only the release tarball it installed' },
    { path: '~/.repo-harness/upgrade-cleanup.log.jsonl', rule: 'rotate', detail: `upgrade keeps the newest ${UPGRADE_AUDIT_MAX_RECORDS} records` },
    { path: '.ai/harness/runs/task-agents', rule: 'keep', detail: 'kept: a closed.json tombstone blocks a session restart' },
    { path: '.ai/harness/runs/task-workspaces', rule: 'keep', detail: 'kept: a closed.json tombstone blocks a workspace restart' },
    { path: `{common}/${TASK_INBOX_V2_RELATIVE_PATH}`, rule: 'keep', detail: noRule },
    { path: `{common}/${FEEDBACK_ROOT_RELATIVE_PATH}`, rule: 'keep', detail: noRule },
    { path: '{common}/repo-harness/integration/v1', rule: 'keep', detail: 'Historical integration evidence; no active authority reader.' },
    { path: `{common}/${INTEGRATION_EVIDENCE_ROOT_RELATIVE_PATH}`, rule: 'keep', detail: noRule },
  ];
}

export function buildRetentionCommand(): Command {
  return new Command('retention')
    .description('Move closed harness artifacts older than the retention window to the local archive root and delete archived entries past the archive window (dry-run unless --apply)')
    .option('--repo <path>', 'Repository root (default: the Git top level of the current directory)')
    .option('--apply', 'Move and delete the selected entries; without it nothing changes')
    .option('--json', 'Output the report and every storage root with its retention rule as JSON')
    .action((options: RetentionCommandOptions) => {
      try {
        const repoRoot = gitExecFileSync(['-C', resolve(options.repo ?? process.cwd()), 'rev-parse', '--show-toplevel'], {
          encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
        }).trim();
        const report = runArtifactRetention({ repoRoot, apply: options.apply === true });
        process.stdout.write(options.json
          ? `${JSON.stringify({ ...report, roots: retentionRoots(report.config) }, null, 2)}\n`
          : formatRetentionReport(report));
        if (report.failed.length > 0 || report.purgeFailed.length > 0) process.exitCode = 1;
      } catch (error) {
        process.stderr.write(`retention: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
      }
    });
}

export function formatRetentionReport(report: RetentionReport): string {
  const { config } = report;
  const verb = report.mode === 'apply' ? 'archived' : 'would archive';
  const purgeVerb = report.mode === 'apply' ? 'deleted' : 'would delete';
  const lines = [
    `retention ${report.mode}: ${verb} ${report.archived.length}, skipped ${report.skipped.length}, failed ${report.failed.length}`,
    `archive ${report.mode}: ${purgeVerb} ${report.purged.length}, failed ${report.purgeFailed.length}`,
    `window ${config.days} days; archive root ${config.archiveRoot}; archive window ${config.archiveDays} days`,
  ];
  const reasons = new Map<string, number>();
  for (const entry of report.skipped) reasons.set(entry.reason, (reasons.get(entry.reason) ?? 0) + 1);
  if (reasons.size > 0) lines.push(`skipped by reason: ${[...reasons].map(([reason, count]) => `${reason} ${count}`).join(', ')}`);
  for (const entry of report.archived) lines.push(`  ${verb}: ${entry.path} (${entry.ageDays}d) -> ${entry.destination}`);
  // The only skip an operator has to resolve by hand; --json lists every skip.
  for (const entry of report.skipped) {
    if (entry.reason === 'destination-exists') lines.push(`  skipped (destination exists): ${entry.path}`);
  }
  for (const entry of report.failed) lines.push(`  failed: ${entry.path}: ${entry.error}`);
  for (const entry of report.purged) lines.push(`  ${purgeVerb}: ${entry.path} (${entry.ageDays}d)`);
  for (const entry of report.purgeFailed) lines.push(`  delete failed: ${entry.path}: ${entry.error}`);
  if (report.mode === 'dry-run' && (report.archived.length > 0 || report.purged.length > 0)) lines.push('Run again with --apply to move and delete these entries.');
  return `${lines.join('\n')}\n`;
}
