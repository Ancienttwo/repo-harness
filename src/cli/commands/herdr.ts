import { RH_NOTIFY_RELAY, hcKill, hcList, hcRm, hcRun } from '../../effects/terminal/herdr-core.ts';
import { notifyConfigPath, notifyDeliveriesPath, notifyInstallRecordPath, readNotifyInstallRecord, relayIsLive, writeNotifyInstallRecord, writePrivateFile } from '../../effects/terminal/herdr-notify-install.ts';
import type { DoctorCheckResult } from './doctor.ts';
import { repoHarnessHome } from '../../effects/repo-harness-home.ts';
import { NOTIFY_CHANNEL_SECRET_KEYS } from '../../core/decision/notify-secret-keys.ts';
import { NOTIFY_DONE_KEYS, decodeNotifyConfig, renderNotifyConfig, runNotifyRelay } from '../../effects/terminal/notify-relay.ts';
import { NOTIFY_INSTALL_COMMAND, NOTIFY_START_COMMAND } from '../../core/operator/notify-status.ts';
import { Command } from 'commander';
import { existsSync, rmSync } from 'node:fs';
import { isAbsolute } from 'node:path';
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

/** The relay terminals, live or also finished. hc's own failure text stays out of the message: it can name private paths. */
function relays(all = false) {
  try { return hcList(RH_NOTIFY_RELAY.labels, { all }).filter(terminal => all || terminal.state === 'live'); }
  catch { throw new Error('hc did not list its terminals. Check that the hc core runs.'); }
}

/** Start the relay terminal unless one is live, then write the install record. The config must already exist. */
function startRelay(running: readonly unknown[]): void {
  if (!running.length) {
    try {
      // An hc terminal starts with the core's environment, not the caller's, so the home travels in argv.
      hcRun({ argv: [process.execPath, CLI_ENTRY, 'herdr', 'notify', 'relay', '--home', repoHarnessHome()],
        labels: RH_NOTIFY_RELAY.labels, name: RH_NOTIFY_RELAY.name, noParent: true });
    } catch { throw new Error(`hc did not start the relay terminal. The config is written. Run: ${NOTIFY_START_COMMAND}`); }
  }
  // Last step: the operator reads the relay identity only from this record.
  try { writeNotifyInstallRecord(); }
  catch { throw new Error(`The relay runs, but the install record was not written. Run: ${NOTIFY_START_COMMAND}`); }
}

export async function installNotify(options: NotifyOptions): Promise<void> {
  if (process.platform === 'win32') throw new Error('Herdr notify needs POSIX file permissions.');
  // Each key comes from its option (`--webhook-url` for WEBHOOK_URL) or the caller's environment.
  const option = (key: string): unknown => (options as Record<string, unknown>)[key.toLowerCase().replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())];
  const values: Record<string, string> = {};
  for (const key of NOTIFY_CHANNEL_SECRET_KEYS) values[key] = (option(key) as string | undefined) ?? process.env[key] ?? '';
  for (const key of NOTIFY_DONE_KEYS) values[key] = option(key) ? '1' : '0';
  if (!options.nonInteractive) {
    for (const key of NOTIFY_CHANNEL_SECRET_KEYS) {
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
  const config = decodeNotifyConfig(values);
  const running = relays();
  // The relay reads the config on each event, so a live relay takes the new config without a restart.
  writePrivateFile(notifyConfigPath(), renderNotifyConfig(config));
  startRelay(running);
  process.stdout.write(`Herdr notify is installed. Relay terminal: ${RH_NOTIFY_RELAY.name}. Default events: blocked.\n`);
}

/** The one manual restart: the relay never restarts itself (no launchd or systemd unit). */
export function startNotify(): void {
  if (!existsSync(notifyConfigPath())) throw new Error(`No notify config. Run: ${NOTIFY_INSTALL_COMMAND}`);
  const running = relays();
  startRelay(running);
  process.stdout.write(running.length ? `Relay terminal ${RH_NOTIFY_RELAY.name} already runs.\n` : `Relay terminal ${RH_NOTIFY_RELAY.name} started.\n`);
}

/** Stop every live relay terminal and remove every relay terminal, also finished ones, then the notify files. A failed hc call keeps the files. */
export function uninstallNotify(): void {
  for (const relay of relays(true)) {
    try {
      if (relay.state === 'live') hcKill(relay.address);
      hcRm(relay.address);
    }
    catch { throw new Error(`hc did not stop relay terminal ${relay.address}. The notify files were kept.`); }
  }
  for (const path of [notifyInstallRecordPath(), notifyConfigPath(), notifyDeliveriesPath()]) rmSync(path, { force: true });
  process.stdout.write('Herdr notify is removed.\n');
}

/** Read-only: one `hc ls` call. Like every hc call, it starts a stopped hc core. */
export function notifyRelayDoctorCheck(): DoctorCheckResult {
  const id = 'herdr-notify-relay';
  const describe = 'Herdr notify relay';
  const record = readNotifyInstallRecord();
  if (record.state === 'missing') return { id, describe, status: 'na', detail: 'Herdr notify is not installed.' };
  if (record.state === 'invalid') return { id, describe, status: 'warn', detail: `The notify install record is invalid (notify_session_invalid). Run: ${NOTIFY_INSTALL_COMMAND}` };
  let relays;
  try { relays = hcList(record.relay.labels); }
  catch { return { id, describe, status: 'warn', detail: 'hc did not answer, so the relay state is unknown (hc_unavailable).' }; }
  if (!relayIsLive(relays, record.relay)) {
    return { id, describe, status: 'warn', detail: `Relay terminal ${record.relay.name} is not live (relay_stopped). Notifications are paused. Run: ${NOTIFY_START_COMMAND}` };
  }
  return { id, describe, status: 'ok', detail: `Relay terminal ${record.relay.name} is live.` };
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
  notify.command('start').description('Start the relay terminal again with the written config')
    .action(() => {
      try { startNotify(); }
      catch (error) {
        const message = error instanceof Error && !('code' in error) ? error.message : 'Cannot read the notify config.';
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
    .requiredOption('--home <path>', 'Absolute repo-harness home that holds the notify config')
    .action(async (options: { home: string }) => {
      if (!isAbsolute(options.home)) { process.stderr.write('[notify-relay] --home must be an absolute path.\n'); process.exitCode = 1; return; }
      try { await runNotifyRelay({ env: { ...process.env, REPO_HARNESS_HOME: options.home } }); }
      catch { process.stderr.write(`[notify-relay] The hc event stream ended. Run: ${NOTIFY_START_COMMAND}\n`); process.exitCode = 1; }
    });
  return command;
}
