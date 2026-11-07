import { Command } from 'commander';
import { formatQuotaReport } from '../../core/board/quota';
import { readQuotaReport } from '../../effects/board/quota';
import { formatSeatRoutes, type SeatAccountStates } from '../../core/board/seat-routing';
import { readSeatsConfiguration } from '../../effects/board/seats-configuration';

/** Exit 0 when the read completes: a failed source is an `unknown` account with its reason, so the coordinator sees each account. */
export function buildQuotaCommand(): Command {
  return new Command('quota')
    .description('Read the rate-limit windows of each provider account and classify them for dispatch')
    .option('--json', 'Print the readings and states as one JSON line')
    .action(async (options: { json?: boolean }) => {
      const report = await readQuotaReport(process.env);
      if (options.json) {
        console.log(JSON.stringify(report));
        return;
      }
      const states = Object.fromEntries(report.accounts.map(account => [account.account, account.state])) as SeatAccountStates;
      console.log(`${formatQuotaReport(report)}\n${formatSeatRoutes(readSeatsConfiguration(process.env).seats, states)}`);
    });
}
