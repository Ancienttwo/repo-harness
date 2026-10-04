import { Command } from 'commander';
import { spawnSync } from 'node:child_process';
import { constants, fchmodSync, closeSync, copyFileSync, fsyncSync, lstatSync, mkdirSync, openSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_ID = 'aimpact.webhook-notify';
const ASSETS = fileURLToPath(new URL('../../../assets/herdr/webhook-notify/', import.meta.url));
const SECRETS = ['WEBHOOK_URL', 'WEBHOOK_KEY', 'SLACK_WEBHOOK_URL', 'DISCORD_WEBHOOK_URL', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'] as const;
interface NotifyOptions {
  session: string;
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

function validateConfig(config: Record<string, string>): void {
  for (const [key, value] of Object.entries(config)) {
    if (/[\x00-\x1f\x7f'"\\]/.test(value)) throw new Error(`${key} contains an unsupported character.`);
  }
  if (!config.WEBHOOK_URL || !config.WEBHOOK_KEY) throw new Error('WEBHOOK_URL and WEBHOOK_KEY are required.');
  if (Boolean(config.TELEGRAM_BOT_TOKEN) !== Boolean(config.TELEGRAM_CHAT_ID)) throw new Error('Telegram needs a bot token and a chat id.');
  for (const key of ['WEBHOOK_URL', 'SLACK_WEBHOOK_URL', 'DISCORD_WEBHOOK_URL']) {
    if (!config[key]) continue;
    let url: URL;
    try { url = new URL(config[key]); } catch { throw new Error(`${key} must be an HTTPS URL.`); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`${key} must be an HTTPS URL without user information.`);
  }
  if (config.TELEGRAM_BOT_TOKEN && !/^\d+:[A-Za-z0-9_-]+$/.test(config.TELEGRAM_BOT_TOKEN)) throw new Error('TELEGRAM_BOT_TOKEN is invalid.');
  if (config.TELEGRAM_CHAT_ID && !/^(?:-?\d+|@[A-Za-z0-9_]+)$/.test(config.TELEGRAM_CHAT_ID)) throw new Error('TELEGRAM_CHAT_ID is invalid.');
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(config.NOTIFY_SESSION)) throw new Error('Session name is invalid.');
}

function herdr(args: string[], env: NodeJS.ProcessEnv): string {
  const result = spawnSync('herdr', args, { env, encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'] });
  // Herdr output can contain private data. Report only the operation.
  if (result.error || result.status !== 0 || result.signal) throw new Error(`Herdr ${args[3]} failed.`);
  return result.stdout.trim();
}

function writeConfig(dir: string, config: Record<string, string>): void {
  const target = join(dir, '.env');
  try {
    const stat = lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Config must be a regular file.');
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const temporary = join(dir, `.env-${randomUUID()}`);
  try {
    const fd = openSync(temporary, 'wx', 0o600);
    try {
      fchmodSync(fd, 0o600);
      writeFileSync(fd, Object.entries(config).map(([key, value]) => `${key}='${value}'`).join('\n') + '\n');
      fsyncSync(fd);
    } finally { closeSync(fd); }
    renameSync(temporary, target);
  } finally {
    try { unlinkSync(temporary); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}

export async function installNotify(options: NotifyOptions): Promise<void> {
  if (process.platform === 'win32') throw new Error('Herdr notify needs POSIX file permissions.');
  const config: Record<string, string> = {
    WEBHOOK_URL: options.webhookUrl ?? process.env.WEBHOOK_URL ?? '',
    WEBHOOK_KEY: options.webhookKey ?? process.env.WEBHOOK_KEY ?? '',
    SLACK_WEBHOOK_URL: options.slackWebhookUrl ?? process.env.SLACK_WEBHOOK_URL ?? '',
    DISCORD_WEBHOOK_URL: options.discordWebhookUrl ?? process.env.DISCORD_WEBHOOK_URL ?? '',
    TELEGRAM_BOT_TOKEN: options.telegramBotToken ?? process.env.TELEGRAM_BOT_TOKEN ?? '',
    TELEGRAM_CHAT_ID: options.telegramChatId ?? process.env.TELEGRAM_CHAT_ID ?? '',
    NOTIFY_SESSION: options.session,
    WEBHOOK_NOTIFY_DONE: options.webhookNotifyDone ? '1' : '0',
    SLACK_NOTIFY_DONE: options.slackNotifyDone ? '1' : '0',
    DISCORD_NOTIFY_DONE: options.discordNotifyDone ? '1' : '0',
    TELEGRAM_NOTIFY_DONE: options.telegramNotifyDone ? '1' : '0',
  };
  if (!options.nonInteractive) {
    for (const key of SECRETS) {
      if (!config[key]) config[key] = (await askMasked(`${key}${key === 'WEBHOOK_URL' || key === 'WEBHOOK_KEY' ? ' (required)' : ' (optional; Enter to skip)'}`)).trim();
    }
    for (const channel of ['WEBHOOK', 'SLACK', 'DISCORD', 'TELEGRAM']) {
      const enabled = channel === 'TELEGRAM' ? config.TELEGRAM_BOT_TOKEN : config[`${channel === 'WEBHOOK' ? 'WEBHOOK' : channel + '_WEBHOOK'}_URL`];
      if (enabled && config[`${channel}_NOTIFY_DONE`] !== '1') {
        const answer = await askMasked(`${channel}: also notify on done? [y/N]`);
        if (!['', 'n', 'no', 'y', 'yes'].includes(answer.toLowerCase())) throw new Error('Enter y or n.');
        config[`${channel}_NOTIFY_DONE`] = ['y', 'yes'].includes(answer.toLowerCase()) ? '1' : '0';
      }
    }
  }
  validateConfig(config);
  const env = { ...process.env };
  for (const name of Object.keys(env)) if (name.startsWith('HERDR_') || SECRETS.includes(name as typeof SECRETS[number])) delete env[name];
  const prefix = ['--session', options.session, 'plugin'];
  const dir = herdr([...prefix, 'config-dir', PLUGIN_ID], env);
  if (!isAbsolute(dir) || /[\r\n\x00]/.test(dir)) throw new Error('Herdr returned an invalid config directory.');
  const source = join(dir, 'source');
  let plugins: unknown;
  try {
    const response = JSON.parse(herdr([...prefix, 'list', '--plugin', PLUGIN_ID, '--json'], env));
    if (response?.result?.type !== 'plugin_list') throw new Error();
    plugins = response.result.plugins;
  } catch {
    throw new Error('Cannot inspect the installed webhook-notify plugin. No files were changed.');
  }
  if (!Array.isArray(plugins) || plugins.length > 1 || plugins.some(plugin =>
    plugin?.plugin_id !== PLUGIN_ID || typeof plugin.plugin_root !== 'string'
    || !isAbsolute(plugin.plugin_root) || typeof plugin.version !== 'string'
    || typeof plugin.source?.kind !== 'string')) {
    throw new Error('Herdr returned invalid webhook-notify plugin data. No files were changed.');
  }
  if (plugins.some(plugin => plugin.source.kind !== 'local' || resolve(plugin.plugin_root) !== resolve(source))) {
    throw new Error('An existing webhook-notify plugin uses another source. No files were changed.\n'
      + `Run: herdr --session ${options.session} plugin unlink ${PLUGIN_ID}\n`
      + `Then run: repo-harness herdr notify install --session ${options.session}`);
  }
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  mkdirSync(source, { recursive: true, mode: 0o700 });
  if (lstatSync(dir).isSymbolicLink() || lstatSync(source).isSymbolicLink()) throw new Error('Plugin directories must not be symbolic links.');
  for (const name of ['herdr-plugin.toml', 'notify.mjs']) {
    const target = join(source, name);
    try {
      const stat = lstatSync(target);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Plugin source must be a regular file.');
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const temporary = join(source, `.${name}-${randomUUID()}`);
    try {
      copyFileSync(join(ASSETS, name), temporary, constants.COPYFILE_EXCL);
      // Rename replaces a late target symlink without writing through it.
      renameSync(temporary, target);
    } finally {
      try { unlinkSync(temporary); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
  }
  herdr([...prefix, 'link', source, '--disabled'], env);
  writeConfig(dir, config);
  herdr([...prefix, 'enable', PLUGIN_ID], env);
  process.stdout.write('Herdr notify is installed. Default events: blocked.\n');
}

export function buildHerdrCommand(): Command {
  const command = new Command('herdr').description('Set up Herdr tools');
  command.command('notify').description('Set up Bot and human notifications')
    .command('install').description('Install and enable the shipped webhook plugin')
    .requiredOption('--session <name>', 'Herdr session to notify')
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
        const message = error instanceof Error && !('code' in error) ? error.message : 'Cannot write the plugin config.';
        process.stderr.write(`Herdr notify: ${message}\n`); process.exitCode = 1;
      }
    });
  return command;
}
