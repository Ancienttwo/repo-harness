import { Command } from 'commander';
import { BotRegistryError, registerBot } from '../../effects/bot-registry';

interface BotsRegisterOptions {
  readonly id: string;
  readonly name: string;
  readonly host: string;
  readonly slackBotId?: string;
  readonly herdrAgent?: string;
  readonly replace?: boolean;
  readonly json?: boolean;
}

export function buildBotsCommand(): Command {
  const bots = new Command('bots').description('Register Bots for attribution; registration grants no access');
  bots
    .command('register')
    .description('Write ~/.repo-harness/bots/<bot-id>.json')
    .requiredOption('--id <bot-id>', 'Bot id: [a-z][a-z0-9-]{0,62}')
    .requiredOption('--name <name>', 'Display name')
    .requiredOption('--host <host>', 'Bot host, for example Hermes, Grok or Dot')
    .option('--slack-bot-id <slack-bot-id>', 'Slack bot id')
    .option('--herdr-agent <name>', 'Herdr agent name of the Bot pane')
    .option('--replace', 'Overwrite an existing record with the same id')
    .option('--json', 'Output JSON')
    .action((options: BotsRegisterOptions) => {
      try {
        const bot = registerBot({
          bot_id: options.id,
          name: options.name,
          host: options.host,
          slack_bot_id: options.slackBotId ?? null,
          herdr_agent: options.herdrAgent ?? null,
          replace: options.replace === true,
        });
        console.log(options.json ? JSON.stringify({ ok: true, bot }, null, 2) : `[repo-harness bots] registered ${bot.bot_id} (${bot.host})`);
      } catch (error) {
        const code = error instanceof BotRegistryError ? error.code : 'bot_register_failed';
        const message = error instanceof Error ? error.message : String(error);
        console.error(options.json ? JSON.stringify({ ok: false, error: code, message }) : `repo-harness bots: ${code}: ${message}`);
        process.exitCode = 2;
      }
    });
  return bots;
}
