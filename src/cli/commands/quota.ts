import { Command } from 'commander';
import { formatQuotaReport } from '../../core/operator/quota';
import { readQuotaReport } from '../../effects/operator/quota';

/** Exit 0 when the read completes: a failed source is an `unknown` account with its reason, so the coordinator sees each account. */
export function buildQuotaCommand(): Command {
  return new Command('quota')
    .description('Read the rate-limit windows of each provider account and classify them for dispatch')
    .option('--json', 'Print the readings and states as one JSON line')
    .action(async (options: { json?: boolean }) => {
      const report = await readQuotaReport(process.env);
      console.log(options.json ? JSON.stringify(report) : formatQuotaReport(report));
    });
}
