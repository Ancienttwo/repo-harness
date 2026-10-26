import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BOT_REGISTRY_MAX_RECORDS, botIdForMcpClient, botRegistryPath, BotRegistryError, readBotRegistry, registerBot } from '../../src/effects/bot-registry';

const NOW = new Date('2026-10-27T00:00:00.000Z');

function home() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'rh-bot-registry-')));
  const env: NodeJS.ProcessEnv = { HOME: join(root, 'home'), REPO_HARNESS_HOME: join(root, 'home', '.repo-harness') };
  return { root, env, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function code(run: () => unknown): string {
  try { run(); } catch (error) { return error instanceof BotRegistryError ? error.code : `unexpected:${String(error)}`; }
  return 'no_error';
}

describe('Bot registry', () => {
  test('register writes one private record per Bot under the account home and reads it back', () => {
    const h = home();
    try {
      const hermes = registerBot({ bot_id: 'hermes', name: 'Hermes', host: 'Hermes', mcp_client_id: 'client-a', slack_bot_id: 'B012ABC', herdr_agent: 'hermes', now: NOW }, h.env);
      registerBot({ bot_id: 'grok', name: 'Grok', host: 'Grok', now: NOW }, h.env);
      expect(botRegistryPath(h.env)).toBe(join(h.env.REPO_HARNESS_HOME!, 'bots'));
      expect(readdirSync(botRegistryPath(h.env)).sort()).toEqual(['grok.json', 'hermes.json']);
      expect(JSON.parse(readFileSync(join(botRegistryPath(h.env), 'hermes.json'), 'utf8'))).toEqual({
        protocol: 1, kind: 'repo-harness-bot', bot_id: 'hermes', name: 'Hermes', host: 'Hermes',
        mcp_client_id: 'client-a', slack_bot_id: 'B012ABC', herdr_agent: 'hermes', registered_at: NOW.toISOString(),
      });
      if (process.platform !== 'win32') expect(statSync(join(botRegistryPath(h.env), 'hermes.json')).mode & 0o777).toBe(0o600);
      const bots = readBotRegistry(h.env);
      expect(bots.map(bot => bot.bot_id)).toEqual(['grok', 'hermes']);
      expect(bots[1]).toEqual(hermes);
      expect(botIdForMcpClient(bots, 'client-a')).toBe('hermes');
      expect(botIdForMcpClient(bots, 'client-z')).toBeNull();
    } finally { h.cleanup(); }
  });

  test('an existing id needs --replace and every external identity names at most one Bot', () => {
    const h = home();
    try {
      registerBot({ bot_id: 'hermes', name: 'Hermes', host: 'Hermes', mcp_client_id: 'client-a', herdr_agent: 'hermes' }, h.env);
      expect(code(() => registerBot({ bot_id: 'hermes', name: 'Hermes 2', host: 'Hermes' }, h.env))).toBe('bot_exists');
      expect(registerBot({ bot_id: 'hermes', name: 'Hermes 2', host: 'Hermes', mcp_client_id: 'client-a', replace: true }, h.env).name).toBe('Hermes 2');
      expect(code(() => registerBot({ bot_id: 'dot', name: 'Dot', host: 'Dot', mcp_client_id: 'client-a' }, h.env))).toBe('bot_conflict');
      expect(readBotRegistry(h.env).map(bot => bot.bot_id)).toEqual(['hermes']);
      for (const input of [
        { bot_id: '../escape', name: 'X', host: 'X' },
        { bot_id: 'ok', name: ' padded', host: 'X' },
        { bot_id: 'ok', name: 'X', host: 'X', slack_bot_id: 'https://hooks.slack.example/T0' },
        { bot_id: 'ok', name: 'X', host: 'X', herdr_agent: 'Has Space' },
      ]) expect(code(() => registerBot(input, h.env))).toBe('bot_invalid');
    } finally { h.cleanup(); }
  });

  test('a new Bot past the registry cap is refused, so every reader keeps working', () => {
    const h = home();
    try {
      const first = registerBot({ bot_id: 'bot-0', name: 'Bot 0', host: 'Dot', now: NOW }, h.env);
      for (let index = 1; index < BOT_REGISTRY_MAX_RECORDS; index += 1) {
        writeFileSync(join(botRegistryPath(h.env), `bot-${index}.json`), JSON.stringify({ ...first, bot_id: `bot-${index}` }));
      }
      expect(readBotRegistry(h.env)).toHaveLength(BOT_REGISTRY_MAX_RECORDS);
      expect(code(() => registerBot({ bot_id: 'one-more', name: 'One more', host: 'Dot' }, h.env))).toBe('bot_registry_full');
      expect(code(() => registerBot({ bot_id: 'one-more', name: 'One more', host: 'Dot', replace: true }, h.env))).toBe('bot_registry_full');
      expect(registerBot({ bot_id: 'bot-0', name: 'Bot zero', host: 'Dot', replace: true }, h.env).name).toBe('Bot zero');
      expect(readBotRegistry(h.env)).toHaveLength(BOT_REGISTRY_MAX_RECORDS);
    } finally { h.cleanup(); }
  });

  test('a malformed record, a renamed record or a shared identity fails the whole read', () => {
    const h = home();
    try {
      expect(readBotRegistry(h.env)).toEqual([]);
      const hermes = registerBot({ bot_id: 'hermes', name: 'Hermes', host: 'Hermes', mcp_client_id: 'client-a' }, h.env);
      const directory = botRegistryPath(h.env);
      writeFileSync(join(directory, 'impostor.json'), JSON.stringify({ ...hermes, bot_id: 'impostor' }));
      expect(code(() => readBotRegistry(h.env))).toBe('bot_registry_invalid');
      writeFileSync(join(directory, 'impostor.json'), JSON.stringify(hermes));
      expect(code(() => readBotRegistry(h.env))).toBe('bot_registry_invalid');
      writeFileSync(join(directory, 'impostor.json'), '{"protocol":1');
      expect(code(() => readBotRegistry(h.env))).toBe('bot_registry_invalid');
      rmSync(join(directory, 'impostor.json'));
      expect(readBotRegistry(h.env)).toHaveLength(1);
    } finally { h.cleanup(); }
  });

  test('`repo-harness bots register` writes the record and reports errors as JSON', () => {
    const h = home();
    try {
      const run = (...args: string[]) => Bun.spawnSync(['bun', 'src/cli/index.ts', 'bots', 'register', ...args, '--json'], { cwd: process.cwd(), env: { ...process.env, ...h.env } });
      const created = run('--id', 'hermes', '--name', 'Hermes', '--host', 'Hermes', '--mcp-client-id', 'client-a', '--herdr-agent', 'hermes');
      expect(created.exitCode).toBe(0);
      expect(JSON.parse(created.stdout.toString())).toMatchObject({ ok: true, bot: { bot_id: 'hermes', mcp_client_id: 'client-a', herdr_agent: 'hermes', slack_bot_id: null } });
      const repeated = run('--id', 'hermes', '--name', 'Hermes', '--host', 'Hermes');
      expect(repeated.exitCode).toBe(2);
      expect(JSON.parse(repeated.stderr.toString())).toMatchObject({ ok: false, error: 'bot_exists' });
      expect(readBotRegistry(h.env).map(bot => bot.bot_id)).toEqual(['hermes']);
    } finally { h.cleanup(); }
  }, 30_000);
});
