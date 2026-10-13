import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { Command } from 'commander';
import { runArtifactRetention, type RetentionReport } from '../../effects/artifact-retention';

interface RetentionCommandOptions {
  repo?: string;
  apply?: boolean;
  json?: boolean;
}

export function buildRetentionCommand(): Command {
  return new Command('retention')
    .description('Move closed harness artifacts older than the retention window to the local archive root (dry-run unless --apply)')
    .option('--repo <path>', 'Repository root (default: the Git top level of the current directory)')
    .option('--apply', 'Move the selected artifacts; without it nothing changes')
    .option('--json', 'Output the report as JSON')
    .action((options: RetentionCommandOptions) => {
      try {
        const repoRoot = execFileSync('git', ['-C', resolve(options.repo ?? process.cwd()), 'rev-parse', '--show-toplevel'], {
          encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
        }).trim();
        const report = runArtifactRetention({ repoRoot, apply: options.apply === true });
        process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : formatRetentionReport(report));
        if (report.failed.length > 0) process.exitCode = 1;
      } catch (error) {
        process.stderr.write(`retention: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
      }
    });
}

export function formatRetentionReport(report: RetentionReport): string {
  const { config } = report;
  const verb = report.mode === 'apply' ? 'archived' : 'would archive';
  const lines = [
    `retention ${report.mode}: ${verb} ${report.archived.length}, skipped ${report.skipped.length}, failed ${report.failed.length}`,
    `window ${config.days} days; archive root ${config.archiveRoot}`,
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
  const leaving = report.archived.filter((entry) => entry.tracked).length;
  if (leaving > 0) lines.push(`${leaving} archived entries are tracked by Git. Retention does not stage or commit; commit their removal.`);
  if (report.mode === 'dry-run' && report.archived.length > 0) lines.push('Run again with --apply to move these entries.');
  return `${lines.join('\n')}\n`;
}
