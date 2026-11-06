import { Command } from 'commander';
import type { EventsInstallOptions } from './events-actions';

const actions = () => import('./events-actions');

export function buildEventsCommand(): Command {
  const command = new Command('events').description('Push GitHub events to the Bot');
  command.command('install').description('Deploy the GitHub events Worker and point the GitHub App at it')
    .option('--webhook-url <url>', 'Bot routine webhook URL (or WEBHOOK_URL)')
    .option('--webhook-key <key>', 'Bot routine webhook key (or WEBHOOK_KEY)')
    .option('--app-id <id>', 'GitHub App id')
    .option('--private-key <path>', 'GitHub App private key file; it is read, never copied')
    .option('--orchestrator-login <login>', 'GitHub login the orchestrator posts as; its comments are not pushed')
    .option('--non-interactive', 'Use flags or environment values without prompts')
    .option('--yes', 'Approve the three listed steps without a prompt')
    .action(async (options: EventsInstallOptions) => {
      try { await (await actions()).installEvents(options); }
      catch (error) {
        // Only our fixed messages reach the terminal. Filesystem errors can contain private paths.
        const message = error instanceof Error && !('code' in error) ? error.message : 'Cannot prepare the Worker files.';
        process.stderr.write(`GitHub events: ${message}\n`); process.exitCode = 1;
      }
    });
  return command;
}
