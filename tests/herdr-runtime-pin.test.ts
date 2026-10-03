import { defaultPolicy } from "../src/core/adoption/standard-plan";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * `.ai/harness/policy.json#external_tooling.herdr` is the single herdr runtime
 * pin. These are drift checks for its readers: CI, the readiness script, and the
 * downstream policy seed must derive the floor, URL, and checksum from that key
 * instead of restating them.
 */
const ROOT = join(import.meta.dir, "..");
const POLICY_PATH = join(ROOT, ".ai/harness/policy.json");
const CI_PATH = join(ROOT, ".github/workflows/ci.yml");
const SCRIPT_PATH = join(ROOT, "scripts/check-agent-tooling.sh");
const SEED_PATHS = [
  join(ROOT, "scripts/lib/project-init-lib.sh"),
];

function readPolicy() {
  return JSON.parse(readFileSync(POLICY_PATH, "utf8"));
}

function herdrInstallStep() {
  const action = Bun.YAML.parse(readFileSync(join(ROOT, '.github/actions/install-pinned-herdr/action.yml'), 'utf8')) as {
    runs: { using: string; steps: Array<{ shell: string; run: string }> };
  };
  expect(action.runs.using).toBe('composite');
  expect(action.runs.steps).toHaveLength(1);
  expect(action.runs.steps[0]!.shell).toBe('bash');
  return action.runs.steps[0]!.run;

}

describe("herdr runtime pin has one source of truth", () => {
  test("the pin parses and its release URL embeds the pinned version", () => {
    const herdr = readPolicy().external_tooling?.herdr;
    expect(herdr).toBeDefined();
    expect(herdr.min_version).toMatch(/^\d+\.\d+\.\d+$/);
    const asset = herdr.release_assets?.["linux-x86_64"];
    expect(asset?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(asset?.url).toContain(`/v${herdr.min_version}/`);
  });

  test("the CI install step reads the pin instead of restating it", () => {
    const workflow = Bun.YAML.parse(readFileSync(CI_PATH, 'utf8')) as {
      jobs: Record<string, { steps: Array<{ name?: string; uses?: string }> }>;
    };
    for (const job of ['verify', 'test']) {
      expect(workflow.jobs[job]!.steps.some(step => step.name === 'Install pinned Herdr runtime'
        && step.uses === './.github/actions/install-pinned-herdr')).toBe(true);
    }
    const step = herdrInstallStep();
    expect(step).toContain(".ai/harness/policy.json");
    expect(step).toContain(".external_tooling.herdr.min_version");
    expect(step).toContain("sha256sum --check");
    expect(step).toContain("herdr --version");
    // No hardcoded version, release tag, or checksum may survive in the step.
    expect(step).not.toMatch(/v?\d+\.\d+\.\d+/);
    expect(step).not.toMatch(/[0-9a-f]{64}/);
  });

  test("check-agent-tooling.sh carries no hand-coded herdr version floor", () => {
    const script = readFileSync(SCRIPT_PATH, "utf8");
    expect(script).toContain('".ai/harness/policy.json#external_tooling.herdr"');
    expect(script).toContain("external_tooling?.herdr?.min_version");
    const herdrLines = script.split("\n").filter((line) => /herdr/i.test(line));
    expect(herdrLines.length).toBeGreaterThan(0);
    for (const line of herdrLines) {
      expect(line).not.toMatch(/\d+\.\d+\.\d+/);
      expect(line).not.toMatch(/minor\s*[<>]=?\s*\d|\[2\]\)\s*[<>]/);
    }
  });

  test("the downstream policy seed projects the same pin", () => {
    const herdr = readPolicy().external_tooling.herdr;
    expect((defaultPolicy("minimal-agentic", "en").external_tooling as Record<string, unknown>).herdr).toEqual(herdr);
    const expected = JSON.stringify(herdr, null, 2)
      .split("\n")
      .map((line) => line.trim());
    for (const seedPath of SEED_PATHS) {
      const seed = readFileSync(seedPath, "utf8");
      const start = seed.indexOf('    "herdr": {');
      expect(start, seedPath).toBeGreaterThanOrEqual(0);
      const block = seed
        .slice(start, seed.indexOf("\n    }\n", start) + "\n    }".length)
        .split("\n")
        .map((line) => line.trim());
      expect(block.slice(1), seedPath).toEqual(expected.slice(1));
    }
  });
});

// These fixtures replace only external I/O. They run the shipped command and plugin.
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { askMasked } from '../src/cli/commands/herdr';

function notifyFixture() {
  const root = mkdtempSync(join(tmpdir(), 'rh-herdr-notify-'));
  const home = join(root, 'home');
  const config = join(root, 'config');
  const state = join(root, 'state');
  const bin = join(root, 'bin');
  for (const dir of [home, config, state, bin]) mkdirSync(dir);
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, '.config'),
    PATH: `${bin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`,
    FIXTURE_CONFIG: config, FIXTURE_CALLS: join(root, 'calls.jsonl') };
  for (const key of Object.keys(env)) if (key.startsWith('HERDR_') || /^(WEBHOOK_|SLACK_|DISCORD_|TELEGRAM_)/.test(key)) delete (env as NodeJS.ProcessEnv)[key];
  const shim = join(bin, 'herdr');
  writeFileSync(shim, `#!${process.execPath}\nimport {appendFileSync} from 'node:fs';\nconst args=process.argv.slice(2);\nappendFileSync(process.env.FIXTURE_CALLS,JSON.stringify({args,secret:process.env.WEBHOOK_KEY??null})+'\\n');\nif(process.env.FIXTURE_FAIL===args[3]) { console.error('private '+process.env.FIXTURE_PRIVATE);process.exit(1); }\nif(args[3]==='config-dir') console.log(process.env.FIXTURE_CONFIG);\n`);
  chmodSync(shim, 0o755);
  const run = (args: string[] = [], extra: NodeJS.ProcessEnv = {}) => spawnSync(process.execPath,
    [join(ROOT, 'src/cli/index.ts'), 'herdr', 'notify', 'install', '--session', 'notify-test', '--non-interactive', ...args],
    { env: { ...env, ...extra }, encoding: 'utf8', timeout: 20_000 });
  return { root, home, config, state, env, run, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

const botFlags = ['--webhook-url', 'https://bot.example/routine', '--webhook-key', 'fixture-secret-key'];

describe('Herdr notify install', () => {
  test('CLI links a durable source, writes private config, and enables it without leaking credentials', async () => {
    const fixture = notifyFixture();
    try {
      const result = fixture.run([...botFlags, '--slack-webhook-url', 'https://slack.example/secret',
        '--discord-webhook-url', 'https://discord.example/secret', '--telegram-bot-token', '123:token', '--telegram-chat-id', '-42', '--slack-notify-done']);
      expect(result.status).toBe(0);
      expect(result.stdout + result.stderr).not.toContain('fixture-secret-key');
      expect(result.stdout + result.stderr).not.toContain('/secret');
      const path = join(fixture.config, '.env');
      expect(statSync(path).mode & 0o777).toBe(0o600);
      const config = parseEnv(readFileSync(path, 'utf8'));
      expect(config.WEBHOOK_KEY).toBe('fixture-secret-key');
      expect(config.NOTIFY_SESSION).toBe('notify-test');
      expect(config.WEBHOOK_NOTIFY_DONE).toBe('0');
      expect(config.SLACK_NOTIFY_DONE).toBe('1');
      expect(config.DISCORD_NOTIFY_DONE).toBe('0');
      expect(config.TELEGRAM_NOTIFY_DONE).toBe('0');
      const calls = readFileSync(fixture.env.FIXTURE_CALLS, 'utf8').trim().split('\n').map(line => JSON.parse(line));
      expect(calls.map(call => call.args)).toEqual([
        ['--session', 'notify-test', 'plugin', 'config-dir', 'aimpact.webhook-notify'],
        ['--session', 'notify-test', 'plugin', 'link', join(fixture.config, 'source'), '--disabled'],
        ['--session', 'notify-test', 'plugin', 'enable', 'aimpact.webhook-notify'],
      ]);
      expect(calls.every(call => call.secret === null)).toBe(true);
      for (const name of ['herdr-plugin.toml', 'notify.mjs']) expect(readFileSync(join(fixture.config, 'source', name), 'utf8')).toBe(readFileSync(join(ROOT, 'assets/herdr/webhook-notify', name), 'utf8'));
      const { notify: installedNotify } = await import(join(fixture.config, 'source/notify.mjs'));
      const delivered: string[] = [];
      await installedNotify({ ...fixture.env, HERDR_SESSION: 'notify-test', HERDR_PLUGIN_CONFIG_DIR: fixture.config,
        HERDR_PLUGIN_STATE_DIR: fixture.state,
        HERDR_PLUGIN_EVENT_JSON: JSON.stringify({ event: 'pane.agent_status_changed', data: { pane_id: 'pane-1', workspace_id: 'workspace-1', agent_status: 'done' } }),
        HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ workspace_cwd: '/Users/operator/project' }),
      }, async (url: string) => { delivered.push(url); return new Response('{"ok":true}'); });
      expect(delivered).toEqual(['https://slack.example/secret']);
      chmodSync(path, 0o644);
      expect(fixture.run([], { WEBHOOK_URL: 'https://bot.example/routine', WEBHOOK_KEY: 'changed-key' }).status).toBe(0);
      expect(statSync(path).mode & 0o777).toBe(0o600);
      expect(parseEnv(readFileSync(path, 'utf8')).WEBHOOK_KEY).toBe('changed-key');
    } finally { fixture.cleanup(); }
  });

  test('invalid or missing credentials fail before Herdr I/O and do not disclose their values', () => {
    const cases = [[], ['--webhook-url', 'https://bot.example'], [...botFlags, '--telegram-bot-token', '123:token'],
      ['--webhook-url', 'private-invalid-url', '--webhook-key', 'secret'],
      ['--webhook-url', 'http://bot.example', '--webhook-key', 'secret'],
      ['--webhook-url', 'https://bot.example', '--webhook-key', "private'key\nINJECT=1"]];
    for (const args of cases) {
      const fixture = notifyFixture();
      try {
        const result = fixture.run(args);
        expect(result.status).toBe(1);
        expect(result.stdout + result.stderr).not.toContain('private');
        expect(existsSync(fixture.env.FIXTURE_CALLS)).toBe(false);
        expect(existsSync(join(fixture.config, '.env'))).toBe(false);
      } finally { fixture.cleanup(); }
    }
  });

  test('Herdr failure output stays private and each failed stage stops installation', () => {
    for (const operation of ['config-dir', 'link', 'enable']) {
      const fixture = notifyFixture();
      try {
        const result = fixture.run(botFlags, { FIXTURE_FAIL: operation, FIXTURE_PRIVATE: 'private-webhook-url' });
        expect(result.status).toBe(1);
        expect(result.stdout + result.stderr).not.toContain('private-webhook-url');
        const calls = readFileSync(fixture.env.FIXTURE_CALLS, 'utf8').trim().split('\n');
        expect(calls).toHaveLength(['config-dir', 'link', 'enable'].indexOf(operation) + 1);
      } finally { fixture.cleanup(); }
    }
  });

  test('a config symlink cannot overwrite another file or enable the plugin', () => {
    const fixture = notifyFixture();
    try {
      const target = join(fixture.home, 'keep'); writeFileSync(target, 'keep');
      symlinkSync(target, join(fixture.config, '.env'));
      expect(fixture.run(botFlags).status).toBe(1);
      expect(readFileSync(target, 'utf8')).toBe('keep');
      expect(readFileSync(fixture.env.FIXTURE_CALLS, 'utf8')).not.toContain('"enable"');
    } finally { fixture.cleanup(); }
  });

  test('masked input restores terminal state on Enter, cancel, and EOF', async () => {
    for (const ending of ['enter', 'cancel', 'eof']) {
      const input = new PassThrough() as unknown as NodeJS.ReadStream;
      const output = new PassThrough() as unknown as NodeJS.WriteStream;
      let terminal = ''; output.on('data', chunk => { terminal += chunk.toString(); });
      Object.assign(input, { isTTY: true, isRaw: false, setRawMode(value: boolean) { this.isRaw = value; return this; } });
      Object.assign(output, { isTTY: true });
      const answer = askMasked('Key', input, output);
      input.write('secret'); input.write('\x7f');
      if (ending === 'enter') input.write('\r');
      else if (ending === 'cancel') input.write('\x03');
      else input.emit('end');
      if (ending === 'enter') expect(await answer).toBe('secre');
      else await expect(answer).rejects.toThrow(ending === 'cancel' ? 'Input canceled.' : 'Input ended.');
      expect(terminal).not.toContain('secret');
      expect(input.isRaw).toBe(false);
      expect(input.listenerCount('data')).toBe(0);
    }
  });
});

const pluginPath = join(ROOT, 'assets/herdr/webhook-notify/notify.mjs');
const { notify } = await import(pluginPath) as { notify: (env: NodeJS.ProcessEnv, send: typeof fetch) => Promise<void> };

describe('shipped Herdr notify event handler', () => {
  function eventFixture(status = 'blocked') {
    const fixture = notifyFixture();
    writeFileSync(join(fixture.config, '.env'), "WEBHOOK_URL='https://bot.example/routine'\nWEBHOOK_KEY='fixture-secret-key'\nNOTIFY_SESSION='notify-test'\nSLACK_WEBHOOK_URL='https://slack.example/hook'\nDISCORD_WEBHOOK_URL='https://discord.example/hook'\nTELEGRAM_BOT_TOKEN='123:token'\nTELEGRAM_CHAT_ID='-42'\n", { mode: 0o600 });
    const env = { ...fixture.env, HERDR_SESSION: 'notify-test', HERDR_PLUGIN_CONFIG_DIR: fixture.config,
      HERDR_PLUGIN_STATE_DIR: fixture.state, HERDR_PLUGIN_EVENT_JSON: JSON.stringify({ event: 'pane.agent_status_changed',
        data: { type: 'pane_agent_status_changed', pane_id: 'pane-1', workspace_id: 'workspace-1', agent_status: status, agent: 'codex', title: 'Needs input' } }),
      HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ workspace_cwd: '/Users/operator/project', focused_pane_cwd: '/Users/operator/project', workspace_label: 'project' }) };
    const calls: Array<{url: string; init: RequestInit}> = [];
    const send = (async (url: string | URL | Request, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;
    return { ...fixture, env, calls, send };
  }

  test('blocked reaches Bot and all selected human channels with native request bodies', async () => {
    const fixture = eventFixture();
    try {
      await notify(fixture.env, fixture.send);
      expect(fixture.calls).toHaveLength(4);
      expect(fixture.calls[0]!.init.headers).toMatchObject({ authorization: 'Bearer fixture-secret-key', 'x-webhook-key': 'fixture-secret-key' });
      expect(JSON.parse(String(fixture.calls[0]!.init.body))).toMatchObject({ pane_id: 'pane-1', agent_status: 'blocked', session: 'notify-test' });
      expect(JSON.parse(String(fixture.calls[1]!.init.body)).text).toContain('Herdr blocked');
      expect(JSON.parse(String(fixture.calls[2]!.init.body)).allowed_mentions).toEqual({ parse: [] });
      expect(fixture.calls[3]!.url).toBe('https://api.telegram.org/bot123:token/sendMessage');
      expect(JSON.parse(String(fixture.calls[3]!.init.body)).chat_id).toBe('-42');
      expect(fixture.calls.every(call => call.init.redirect === 'error' && call.init.signal instanceof AbortSignal)).toBe(true);
      await notify(fixture.env, fixture.send);
      expect(fixture.calls).toHaveLength(4);
    } finally { fixture.cleanup(); }
  });

  test('done is opt-in for each channel, and working sends nothing', async () => {
    for (const channel of ['WEBHOOK', 'SLACK', 'DISCORD', 'TELEGRAM']) {
      const fixture = eventFixture('done');
      try {
        await notify(fixture.env, fixture.send); expect(fixture.calls).toHaveLength(0);
        writeFileSync(join(fixture.config, '.env'), readFileSync(join(fixture.config, '.env'), 'utf8') + `${channel}_NOTIFY_DONE=1\n`);
        await notify(fixture.env, fixture.send); expect(fixture.calls).toHaveLength(1);
        const expectedUrl = { WEBHOOK: 'https://bot.example', SLACK: 'https://slack.example', DISCORD: 'https://discord.example', TELEGRAM: 'https://api.telegram.org' }[channel]!;
        expect(fixture.calls[0]!.url).toStartWith(expectedUrl);
        fixture.env.HERDR_PLUGIN_EVENT_JSON = fixture.env.HERDR_PLUGIN_EVENT_JSON.replace('done', 'working');
        await notify(fixture.env, fixture.send); expect(fixture.calls).toHaveLength(1);
      } finally { fixture.cleanup(); }
    }
  });

  test('session and temporary workspace filters stop every delivery', async () => {
    for (const path of ['/tmp', '/tmp/test', '/private/tmp/test', '/var/folders/test', '/private/var/folders/test', join(tmpdir(), 'test')]) {
      const fixture = eventFixture();
      try {
        fixture.env.HERDR_PLUGIN_CONTEXT_JSON = JSON.stringify({ workspace_cwd: '/Users/operator/project', focused_pane_cwd: path });
        await notify(fixture.env, fixture.send); expect(fixture.calls).toHaveLength(0);
      } finally { fixture.cleanup(); }
    }
    for (const change of ['session', 'label']) {
      const fixture = eventFixture();
      try {
        if (change === 'session') fixture.env.HERDR_SESSION = 'other-session';
        else fixture.env.HERDR_PLUGIN_CONTEXT_JSON = JSON.stringify({ workspace_cwd: '/Users/operator/project', workspace_label: 'rh-herdr-test' });
        await notify(fixture.env, fixture.send); expect(fixture.calls).toHaveLength(0);
      } finally { fixture.cleanup(); }
    }
  });

  test('failed targets retry without repeating targets that succeeded', async () => {
    const fixture = eventFixture();
    try {
      let first = true;
      const send = (async (url: string | URL | Request, init: RequestInit) => {
        if (first && String(url).includes('bot.example')) throw new Error('private-token-and-url');
        if (first && String(url).includes('discord.example')) return new Response('', { status: 429 });
        if (first && String(url).includes('telegram.org')) return new Response('{"ok":false}', { status: 200 });
        return fixture.send(url, init);
      }) as typeof fetch;
      await notify(fixture.env, send); expect(fixture.calls).toHaveLength(1);
      first = false;
      await notify(fixture.env, send); expect(fixture.calls).toHaveLength(4);
      await notify(fixture.env, send); expect(fixture.calls).toHaveLength(4);
    } finally { fixture.cleanup(); }
  });

  test('default session identity and expired debounce state allow fresh blocked events', async () => {
    const fixture = eventFixture();
    try {
      writeFileSync(join(fixture.config, '.env'), readFileSync(join(fixture.config, '.env'), 'utf8').replace('notify-test', 'default'));
      delete (fixture.env as NodeJS.ProcessEnv).HERDR_SESSION;
      await notify(fixture.env, fixture.send); expect(fixture.calls).toHaveLength(4);
      const statePath = join(fixture.state, 'debounce-state.json');
      const state = JSON.parse(readFileSync(statePath, 'utf8'));
      for (const key of Object.keys(state)) state[key] = Date.now() - 120_001;
      writeFileSync(statePath, JSON.stringify(state));
      await notify(fixture.env, fixture.send); expect(fixture.calls).toHaveLength(8);
      expect(statSync(statePath).mode & 0o777).toBe(0o600);
    } finally { fixture.cleanup(); }
  });

  test('missing Bot config, malformed events, and missing paths fail closed', async () => {
    for (const invalid of ['bot', 'event', 'path', 'relative-path', 'state']) {
      const fixture = eventFixture();
      try {
        if (invalid === 'bot') writeFileSync(join(fixture.config, '.env'), 'NOTIFY_SESSION=notify-test\n');
        if (invalid === 'event') fixture.env.HERDR_PLUGIN_EVENT_JSON = '{';
        if (invalid === 'path') fixture.env.HERDR_PLUGIN_CONTEXT_JSON = '{}';
        if (invalid === 'relative-path') fixture.env.HERDR_PLUGIN_CONTEXT_JSON = '{"workspace_cwd":"relative"}';
        if (invalid === 'state') writeFileSync(join(fixture.state, 'debounce-state.json'), '{');
        await expect(notify(fixture.env, fixture.send)).rejects.toThrow();
        expect(fixture.calls).toHaveLength(0);
      } finally { fixture.cleanup(); }
    }
  });
});
