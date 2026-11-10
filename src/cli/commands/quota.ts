import { Command } from 'commander';
import { formatQuotaReport } from '../../core/board/quota';
import { readQuotaReport } from '../../effects/board/quota';
import { formatSeatModes, formatSeatRoutes, seatAccountQuotas } from '../../core/board/seat-routing';
import { readSeatsConfiguration } from '../../effects/board/seats-configuration';

/** Exit 0 when the read completes: a failed source is an `unknown` account with its reason, so the coordinator sees each account. */
export function buildQuotaCommand(): Command {
  return new Command('quota')
    .description('Read the rate-limit windows of each provider account and classify them for dispatch')
    .option('--json', 'Print the readings and states as one JSON line')
    .option('--spend-credits', 'Owner-authorized: treat an exhausted ChatGPT account that still has credits as tight')
    .action(async (options: { json?: boolean; spendCredits?: boolean }) => {
      const report = await readQuotaReport(process.env);
      if (options.json) {
        console.log(JSON.stringify(report));
        return;
      }
      const { seats } = readSeatsConfiguration(process.env);
      const quota = seatAccountQuotas(report.accounts, seats.routing, { spendCredits: options.spendCredits === true });
      console.log(`${formatQuotaReport(report)}\n${formatSeatModes(seats, quota)}\n${formatSeatRoutes(seats, quota)}`);
    });
}
