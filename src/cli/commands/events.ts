import { Command } from 'commander';
import { spawnSync } from 'node:child_process';
import { type KeyObject, createPrivateKey, randomBytes, sign } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { askMasked } from './herdr.ts';

const WORKER_ASSETS = fileURLToPath(new URL('../../../assets/herdr/github-events/', import.meta.url));
const BOT_EVENT = fileURLToPath(new URL('../../../assets/herdr/webhook-notify/bot-event.mjs', import.meta.url));
const GITHUB_API = 'https://api.github.com';
const APP_EVENTS = ['check_run', 'issue_comment', 'issues', 'pull_request', 'pull_request_review', 'pull_request_review_comment', 'workflow_run'];
const LOGIN = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}(?:\[bot\])?$/;
const WRANGLER_TIMEOUT_MS = 300_000;

export interface EventsInstallOptions {
  webhookUrl?: string;
  webhookKey?: string;
  appId?: string;
  privateKey?: string;
  orchestratorLogin?: string;
  nonInteractive?: boolean;
  yes?: boolean;
}

export interface EventsInstallDeps {
  fetch: typeof fetch;
  env: NodeJS.ProcessEnv;
  ask: (question: string) => Promise<string>;
  now: () => number;
}

interface Inputs { webhookUrl: string; webhookKey: string; appId: string; privateKey: string; orchestratorLogin: string }

async function readInputs(options: EventsInstallOptions, deps: EventsInstallDeps): Promise<Inputs> {
  const inputs: Inputs = {
    webhookUrl: options.webhookUrl ?? deps.env.WEBHOOK_URL ?? '',
    webhookKey: options.webhookKey ?? deps.env.WEBHOOK_KEY ?? '',
    appId: options.appId ?? '',
    privateKey: options.privateKey ?? '',
    orchestratorLogin: options.orchestratorLogin ?? '',
  };
  if (!options.nonInteractive) {
    const questions: Record<keyof Inputs, string> = {
      webhookUrl: 'Bot routine webhook URL', webhookKey: 'Bot routine webhook key', appId: 'GitHub App id',
      privateKey: 'GitHub App private key file', orchestratorLogin: 'GitHub login the orchestrator posts as',
    };
    for (const key of Object.keys(questions) as (keyof Inputs)[]) {
      if (!inputs[key]) inputs[key] = (await deps.ask(questions[key])).trim();
    }
  }
  let url: URL;
  try { url = new URL(inputs.webhookUrl); } catch { throw new Error('The Bot webhook URL must be an HTTPS URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('The Bot webhook URL must be an HTTPS URL without user information.');
  if (!inputs.webhookKey || /[\x00-\x1f\x7f]/.test(inputs.webhookKey)) throw new Error('The Bot webhook key is missing or invalid.');
  if (!/^\d{1,20}$/.test(inputs.appId)) throw new Error('The GitHub App id must be a number.');
  if (!LOGIN.test(inputs.orchestratorLogin)) throw new Error('The orchestrator login is not a valid GitHub login.');
  return inputs;
}

// A GitHub App JWT. The key stays in memory; it is never copied or written.
function appJwt(appId: string, key: KeyObject, now: number): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const iat = Math.floor(now / 1000) - 60;
  const data = `${part({ alg: 'RS256', typ: 'JWT' })}.${part({ iat, exp: iat + 600, iss: Number(appId) })}`;
  return `${data}.${sign('RSA-SHA256', Buffer.from(data), key).toString('base64url')}`;
}

// wrangler writes one JSON entry per line to WRANGLER_OUTPUT_FILE_PATH; the deploy entry lists the Worker URLs.
function wranglerWorkerUrl(outputFile: string): string {
  const noUrl = new Error('wrangler deploy reported no HTTPS Worker URL.');
  let entries: { type?: unknown; targets?: unknown }[];
  try { entries = readFileSync(outputFile, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)); } catch { throw noUrl; }
  const deploy = entries.find((entry) => entry?.type === 'deploy');
  const target = Array.isArray(deploy?.targets) ? deploy.targets.find((value: unknown) => typeof value === 'string' && value.startsWith('https://')) : undefined;
  if (!target) throw noUrl;
  return target;
}

export async function installEvents(options: EventsInstallOptions, deps: EventsInstallDeps = { fetch, env: process.env, ask: askMasked, now: Date.now }): Promise<void> {
  if (process.platform === 'win32') throw new Error('events install needs POSIX file permissions.');
  const inputs = await readInputs(options, deps);
  let key: KeyObject;
  try { key = createPrivateKey(readFileSync(inputs.privateKey)); } catch { throw new Error('Cannot read the GitHub App private key.'); }
  const github = async (method: string, path: string, body?: object) => {
    const endpoint = `GitHub API ${method} ${path.split('?')[0]}`;
    let response: Response;
    try {
      // A new JWT for each call: the approval prompt and wrangler can outlast one JWT.
      response = await deps.fetch(`${GITHUB_API}${path}`, {
        method, redirect: 'error', body: body && JSON.stringify(body),
        headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${appJwt(inputs.appId, key, deps.now())}`, 'user-agent': 'repo-harness', 'x-github-api-version': '2022-11-28' },
      });
    } catch { throw new Error(`${endpoint} is unreachable.`); }
    if (!response.ok) throw new Error(`${endpoint} returned HTTP ${response.status}.`);
    return response.json();
  };

  const app = await github('GET', '/app');
  if (typeof app?.slug !== 'string' || !/^[a-z0-9-]{1,64}$/.test(app.slug) || !Array.isArray(app.events)) throw new Error('GitHub returned invalid App data. No change was made.');
  const missing = APP_EVENTS.filter((event) => !app.events.includes(event));
  if (missing.length) throw new Error(`GitHub App ${app.slug} does not subscribe to: ${missing.join(', ')}. Add them in the App settings. No change was made.`);
  const installations = await github('GET', '/app/installations?per_page=100');
  const accounts: string[] = Array.isArray(installations) ? installations.map((entry) => String(entry?.account?.login)) : [];
  const config = JSON.parse(readFileSync(join(WORKER_ASSETS, 'wrangler.json'), 'utf8'));
  const queue: string = config.queues.producers[0].queue;

  process.stderr.write(`events install runs three steps that need your approval:\n`
    + `1. Deploy Worker ${config.name} to Cloudflare with wrangler (production). It creates queue ${queue} and its KV namespace when they are missing.\n`
    + `2. Write the Worker secrets: a new GitHub webhook secret, the Bot webhook URL and the Bot webhook key (credentials).\n`
    + `3. Point the webhook of GitHub App ${app.slug} at the Worker with the new secret (repository permissions).\n`);
  if (!options.yes) {
    if (options.nonInteractive) throw new Error('Approve the three steps with --yes. No change was made.');
    if (!['y', 'yes'].includes((await deps.ask('Run these three steps? [y/N]')).trim().toLowerCase())) throw new Error('Installation canceled. No change was made.');
  }

  const childEnv = { ...deps.env };
  for (const name of ['WEBHOOK_URL', 'WEBHOOK_KEY', 'WRANGLER_OUTPUT_FILE_DIRECTORY', 'WRANGLER_OUTPUT_FILE_PATH']) delete childEnv[name];
  const stage = mkdtempSync(join(tmpdir(), 'rh-events-'));
  // The Worker imports ../webhook-notify/bot-event.mjs, so the stage keeps the asset layout.
  const project = join(stage, 'github-events');
  try {
    mkdirSync(project);
    mkdirSync(join(stage, 'webhook-notify'));
    for (const name of ['worker.mjs', 'filter.mjs', 'wrangler.json']) copyFileSync(join(WORKER_ASSETS, name), join(project, name));
    copyFileSync(BOT_EVENT, join(stage, 'webhook-notify', 'bot-event.mjs'));
    const secret = randomBytes(32).toString('hex');
    writeFileSync(join(project, 'secrets.json'), JSON.stringify({ GITHUB_WEBHOOK_SECRET: secret, BOT_WEBHOOK_URL: inputs.webhookUrl, BOT_WEBHOOK_KEY: inputs.webhookKey }), { mode: 0o600, flag: 'wx' });
    const wrangler = (args: string[], env: NodeJS.ProcessEnv = childEnv, stdio: 'ignore' | 2 = 2) =>
      spawnSync('wrangler', args, { cwd: project, env, stdio: ['ignore', stdio, stdio], timeout: WRANGLER_TIMEOUT_MS });
    const run = (args: string[], env?: NodeJS.ProcessEnv) => {
      const result = wrangler(args, env);
      if (result.error || result.status !== 0) throw new Error(`wrangler ${args.slice(0, 2).join(' ')} failed.`);
    };
    if (wrangler(['queues', 'info', queue], childEnv, 'ignore').status !== 0) run(['queues', 'create', queue]);
    const outputFile = join(project, 'wrangler-output.json');
    run(['deploy', '--config', 'wrangler.json', '--secrets-file', 'secrets.json', '--var', `ORCHESTRATOR_LOGIN:${inputs.orchestratorLogin}`],
      { ...childEnv, WRANGLER_OUTPUT_FILE_PATH: outputFile });
    let url = '';
    try {
      url = wranglerWorkerUrl(outputFile);
      await github('PATCH', '/app/hook/config', { url, content_type: 'json', secret, insecure_ssl: '0' });
    } catch (error) {
      throw new Error(`The Worker has a new webhook secret, but the GitHub App was not updated: ${(error as Error).message} `
        + 'Deliveries to an existing Worker URL get HTTP 401 until events install succeeds. Run it again.');
    }
    process.stdout.write(`GitHub events Worker: ${url}\nGitHub App ${app.slug} sends its webhooks there. Installations: ${accounts.length ? accounts.join(', ') : 'none'}.\n`
      + (accounts.length ? '' : `Install the App: https://github.com/apps/${app.slug}/installations/new\n`));
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

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
      try { await installEvents(options); }
      catch (error) {
        // Only our fixed messages reach the terminal. Filesystem errors can contain private paths.
        const message = error instanceof Error && !('code' in error) ? error.message : 'Cannot prepare the Worker files.';
        process.stderr.write(`GitHub events: ${message}\n`); process.exitCode = 1;
      }
    });
  return command;
}
