import { Command } from 'commander';
import type { NotifyOptions } from './herdr-actions';

const actions = () => import('./herdr-actions');

export function buildHerdrCommand(): Command {
  const command = new Command('herdr').description('Set up Herdr tools');
  const notify = command.command('notify').description('Set up Bot and human notifications');
  notify.command('install').description('Write the notify config and start the relay in an hc terminal')
    .option('--non-interactive', 'Use flags or environment values without prompts')
    .option('--webhook-url <url>', 'Required Bot routine webhook URL')
    .option('--webhook-key <key>', 'Required Bot routine webhook key')
    .option('--slack-webhook-url <url>', 'Optional Slack incoming webhook URL')
    .option('--discord-webhook-url <url>', 'Optional Discord webhook URL')
    .option('--telegram-bot-token <token>', 'Optional Telegram bot token')
    .option('--telegram-chat-id <id>', 'Optional Telegram chat id')
    .option('--webhook-notify-done', 'Also send done events to the Bot')
    .option('--slack-notify-done', 'Also send done events to Slack')
    .option('--discord-notify-done', 'Also send done events to Discord')
    .option('--telegram-notify-done', 'Also send done events to Telegram')
    .action(async (options: NotifyOptions) => {
      try { await (await actions()).installNotify(options); }
      catch (error) {
        // Only our fixed messages can reach the terminal. Filesystem errors may contain secrets in paths.
        const message = error instanceof Error && !('code' in error) ? error.message : 'Cannot write the notify config.';
        process.stderr.write(`Herdr notify: ${message}\n`); process.exitCode = 1;
      }
    });
  notify.command('start').description('Start the relay terminal again with the written config')
    .action(async () => {
      try { (await actions()).startNotify(); }
      catch (error) {
        const message = error instanceof Error && !('code' in error) ? error.message : 'Cannot read the notify config.';
        process.stderr.write(`Herdr notify: ${message}\n`); process.exitCode = 1;
      }
    });
  notify.command('uninstall').description('Stop the relay terminal and remove the notify config')
    .action(async () => {
      try { (await actions()).uninstallNotify(); }
      catch (error) {
        const message = error instanceof Error && !('code' in error) ? error.message : 'Cannot remove the notify files.';
        process.stderr.write(`Herdr notify: ${message}\n`); process.exitCode = 1;
      }
    });
  notify.command('relay').description('Follow hc events and send notices (install runs this in an hc terminal)')
    .requiredOption('--home <path>', 'Absolute repo-harness home that holds the notify config')
    .action(async (options: { home: string }) => {
      await (await actions()).relayNotify(options.home);
    });
  return command;
}
