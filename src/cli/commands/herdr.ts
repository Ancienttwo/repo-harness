import { RH_NOTIFY_RELAY, hcKill, hcList, hcRm, hcRun, type HerdrCoreOptions } from '../../effects/terminal/herdr-core.ts';
import { notifyConfigPath, notifyDeliveriesPath, notifyInstallRecordPath, writeNotifyInstallRecord, writePrivateFile } from '../../effects/terminal/herdr-notify-install.ts';
import { NOTIFY_SECRET_KEYS, renderNotifyConfig, runNotifyRelay, type NotifyConfig } from '../../effects/terminal/notify-relay.ts';
import { Command } from 'commander';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CLI_ENTRY = fileURLToPath(new URL('../index.ts', import.meta.url));
interface NotifyOptions {
  nonInteractive?: boolean;
  webhookUrl?: string;
  webhookKey?: string;
  slackWebhookUrl?: string;
  discordWebhookUrl?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  webhookNotifyDone?: boolean;
  slackNotifyDone?: boolean;
  discordNotifyDone?: boolean;
  telegramNotifyDone?: boolean;
}

// Read without terminal echo. Restore raw mode on success, EOF, and cancel.
export function askMasked(question: string, input: NodeJS.ReadStream = process.stdin, output: NodeJS.WriteStream = process.stderr): Promise<string> {
  if (!input.isTTY || !output.isTTY) throw new Error('Use --non-interactive outside a terminal.');
  return new Promise((resolve, reject) => {
    const wasRaw = input.isRaw;
    let answer = '';
    const finish = (error?: Error) => {
      input.off('data', onData); input.off('end', onEnd);
      input.setRawMode(wasRaw); input.pause(); output.write('\n');
      if (error) reject(error); else resolve(answer);
    };
    const onEnd = () => finish(new Error('Input ended.'));
    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\x03' || char === '\x04') { finish(new Error('Input canceled.')); return; }
        if (char === '\r' || char === '\n') { finish(); return; }
        if (char === '\x7f' || char === '\b') { answer = Array.from(answer).slice(0, -1).join(''); continue; }
        if (char >= ' ' && char !== '\x1b') answer += char;
      }
    };
    output.write(`${question}: `);
    input.setRawMode(true); input.on('data', onData); input.once('end', onEnd); input.resume();
  });
}

function validateConfig(config: NotifyConfig): void {
  for (const [key, value] of Object.entries(config)) {
    if (/[\x00-\x1f\x7f'"\\]/.test(value)) throw new Error(`${key} contains an unsupported character.`);
  }
  if (!config.WEBHOOK_URL || !config.WEBHOOK_KEY) throw new Error('WEBHOOK_URL and WEBHOOK_KEY are required.');
  if (Boolean(config.TELEGRAM_BOT_TOKEN) !== Boolean(config.TELEGRAM_CHAT_ID)) throw new Error('Telegram needs a bot token and a chat id.');
  for (const key of ['WEBHOOK_URL', 'SLACK_WEBHOOK_URL', 'DISCORD_WEBHOOK_URL'] as const) {
    if (!config[key]) continue;
    let url: URL;
    try { url = new URL(config[key]); } catch { throw new Error(`${key} must be an HTTPS URL.`); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`${key} must be an HTTPS URL without user information.`);
  }
  if (config.TELEGRAM_BOT_TOKEN && !/^\d+:[A-Za-z0-9_-]+$/.test(config.TELEGRAM_BOT_TOKEN)) throw new Error('TELEGRAM_BOT_TOKEN is invalid.');
  if (config.TELEGRAM_CHAT_ID && !/^(?:-?\d+|@[A-Za-z0-9_]+)$/.test(config.TELEGRAM_CHAT_ID)) throw new Error('TELEGRAM_CHAT_ID is invalid.');
}

/** The environment for hc calls and the relay terminal: no notify secret from the caller's shell. */
function hcOptions(): HerdrCoreOptions {
  const env = { ...process.env };
  for (const name of NOTIFY_SECRET_KEYS) delete env[name];
  return { env };
}

/** The live relay terminals. hc's own failure text stays out of the message: it can name private paths. */
function liveRelays(options: HerdrCoreOptions) {
  try { return hcList(RH_NOTIFY_RELAY.labels, options).filter(terminal => terminal.state === 'live'); }
  catch { throw new Error('hc did not list its terminals. Check that the hc core runs.'); }
}

export async function installNotify(options: NotifyOptions): Promise<void> {
  if (process.platform === 'win32') throw new Error('Herdr notify needs POSIX file permissions.');
  const values: Record<string, string> = {
    WEBHOOK_URL: options.webhookUrl ?? process.env.WEBHOOK_URL ?? '',
    WEBHOOK_KEY: options.webhookKey ?? process.env.WEBHOOK_KEY ?? '',
    SLACK_WEBHOOK_URL: options.slackWebhookUrl ?? process.env.SLACK_WEBHOOK_URL ?? '',
    DISCORD_WEBHOOK_URL: options.discordWebhookUrl ?? process.env.DISCORD_WEBHOOK_URL ?? '',
    TELEGRAM_BOT_TOKEN: options.telegramBotToken ?? process.env.TELEGRAM_BOT_TOKEN ?? '',
    TELEGRAM_CHAT_ID: options.telegramChatId ?? process.env.TELEGRAM_CHAT_ID ?? '',
    WEBHOOK_NOTIFY_DONE: options.webhookNotifyDone ? '1' : '0',
    SLACK_NOTIFY_DONE: options.slackNotifyDone ? '1' : '0',
    DISCORD_NOTIFY_DONE: options.discordNotifyDone ? '1' : '0',
    TELEGRAM_NOTIFY_DONE: options.telegramNotifyDone ? '1' : '0',
  };
  if (!options.nonInteractive) {
    for (const key of NOTIFY_SECRET_KEYS) {
      if (!values[key]) values[key] = (await askMasked(`${key}${key === 'WEBHOOK_URL' || key === 'WEBHOOK_KEY' ? ' (required)' : ' (optional; Enter to skip)'}`)).trim();
    }
    for (const channel of ['WEBHOOK', 'SLACK', 'DISCORD', 'TELEGRAM']) {
      const enabled = channel === 'TELEGRAM' ? values.TELEGRAM_BOT_TOKEN : values[`${channel === 'WEBHOOK' ? 'WEBHOOK' : channel + '_WEBHOOK'}_URL`];
      if (enabled && values[`${channel}_NOTIFY_DONE`] !== '1') {
        const answer = await askMasked(`${channel}: also notify on done? [y/N]`);
        if (!['', 'n', 'no', 'y', 'yes'].includes(answer.toLowerCase())) throw new Error('Enter y or n.');
        values[`${channel}_NOTIFY_DONE`] = ['y', 'yes'].includes(answer.toLowerCase()) ? '1' : '0';
      }
    }
  }
  const config = values as NotifyConfig;
  validateConfig(config);
  const hc = hcOptions();
  const running = liveRelays(hc);
  // The relay reads the config on each event, so a live relay takes the new config without a restart.
  writePrivateFile(notifyConfigPath(), renderNotifyConfig(config));
  if (!running.length) {
    try {
      hcRun({ argv: [process.execPath, CLI_ENTRY, 'herdr', 'notify', 'relay'], labels: RH_NOTIFY_RELAY.labels, name: RH_NOTIFY_RELAY.name, noParent: true }, hc);
    } catch { throw new Error('hc did not start the relay terminal. The config is written. Run install again.'); }
  }
  // Last step: the operator reads the relay identity only from this record.
  try { writeNotifyInstallRecord(); }
  catch { throw new Error('The relay runs, but the install record was not written. Run: repo-harness herdr notify install'); }
  process.stdout.write(`Herdr notify is installed. Relay terminal: ${RH_NOTIFY_RELAY.name}. Default events: blocked.\n`);
}

/** Stop and remove every relay terminal, then remove the notify files. A failed hc call keeps the files. */
export function uninstallNotify(): void {
  const hc = hcOptions();
  for (const relay of liveRelays(hc)) {
    try { hcKill(relay.address, hc); hcRm(relay.address, hc); }
    catch { throw new Error(`hc did not stop relay terminal ${relay.address}. The notify files were kept.`); }
  }
  for (const path of [notifyInstallRecordPath(), notifyConfigPath(), notifyDeliveriesPath()]) rmSync(path, { force: true });
  process.stdout.write('Herdr notify is removed.\n');
}

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
      try { await installNotify(options); }
      catch (error) {
        // Only our fixed messages can reach the terminal. Filesystem errors may contain secrets in paths.
        const message = error instanceof Error && !('code' in error) ? error.message : 'Cannot write the notify config.';
        process.stderr.write(`Herdr notify: ${message}\n`); process.exitCode = 1;
      }
    });
  notify.command('uninstall').description('Stop the relay terminal and remove the notify config')
    .action(() => {
      try { uninstallNotify(); }
      catch (error) {
        const message = error instanceof Error && !('code' in error) ? error.message : 'Cannot remove the notify files.';
        process.stderr.write(`Herdr notify: ${message}\n`); process.exitCode = 1;
      }
    });
  notify.command('relay').description('Follow hc events and send notices (install runs this in an hc terminal)')
    .action(async () => {
      try { await runNotifyRelay({ env: process.env }); }
      catch { process.stderr.write('[notify-relay] The hc event stream ended. Run: repo-harness herdr notify install\n'); process.exitCode = 1; }
    });
  return command;
}
