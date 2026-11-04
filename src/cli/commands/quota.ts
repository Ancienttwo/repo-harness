import { Command } from 'commander';
import { buildQuotaReport, formatQuotaReport } from '../../core/operator/quota';
import { readClaudeQuota, readCodexQuota } from '../../effects/operator/quota';
import { CLI_VERSION } from './status';

/** Exit 0 when the read completes: a failed source is an `unknown` account with its reason, so the coordinator sees each account. */
export function buildQuotaCommand(): Command {
  return new Command('quota')
    .description('Read the rate-limit windows of each provider account and classify them for dispatch')
    .option('--json', 'Print the readings and states as one JSON line')
    .action(async (options: { json?: boolean }) => {
      const readings = [readClaudeQuota(process.env), await readCodexQuota(process.env, CLI_VERSION)];
      const report = buildQuotaReport(readings, Date.now());
      console.log(options.json ? JSON.stringify(report) : formatQuotaReport(report));
    });
}
