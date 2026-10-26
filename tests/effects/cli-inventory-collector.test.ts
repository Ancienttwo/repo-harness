import { afterEach, describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { HOOK_EVENT_TELEMETRY_PATH } from '../../src/cli/hook/event-telemetry';
import { decodeCliInventory } from '../../src/core/setup/cli-inventory';
import { appendSegmentedLog } from '../../src/effects/segmented-log';
import {
  collectCliInventory,
  createCliInventoryCache,
  startCliInventoryCollector,
  type CliProbe,
} from '../../src/effects/setup/cli-inventory';

const NOW = Date.parse('2026-10-26T00:00:00.000Z');
const scratch: string[] = [];
afterEach(() => { for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true }); });

function executable(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, '#!/bin/sh\n');
  chmodSync(path, 0o755);
}

function link(target: string, path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  symlinkSync(target, path);
}

/** A HOME with one npm global package and one Homebrew formula, and canned manager output. */
function machine() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'cli-inventory-')));
  scratch.push(root);
  const home = join(root, 'home');
  const brew = join(root, 'brew');
  const codex = join(home, '.nvm/lib/node_modules/@openai/codex');
  executable(join(codex, 'bin/codex.js'));
  writeFileSync(join(codex, 'package.json'), JSON.stringify({ version: '0.150.0', repository: { url: 'git+https://github.com/openai/codex.git' } }));
  link(join(codex, 'bin/codex.js'), join(home, '.nvm/bin/codex'));
  executable(join(brew, 'Cellar/gh/2.60.0/bin/gh'));
  link(join(brew, 'Cellar/gh/2.60.0/bin/gh'), join(brew, 'bin/gh'));
  executable(join(brew, 'Cellar/openssl/3.0/bin/openssl'));
  link(join(brew, 'Cellar/openssl/3.0/bin/openssl'), join(brew, 'bin/openssl'));
  writeFileSync(join(home, '.nvm/bin/notes.txt'), 'not executable');

  const outputs = new Map<string, string>([
    ['brew --prefix', `${brew}\n`],
    ['brew info --json=v2 --installed', JSON.stringify({
      formulae: [
        { name: 'gh', full_name: 'gh', homepage: 'https://cli.github.com/', urls: { stable: { url: 'https://github.com/cli/cli/archive/v2.60.0.tar.gz' } },
          installed: [{ version: '2.60.0', installed_on_request: true }], deprecated: false, disabled: false },
        { name: 'openssl', full_name: 'openssl@3', homepage: 'https://openssl.org', installed: [{ version: '3.0', installed_on_request: false }] },
      ],
      casks: [],
    })],
    ['npm root -g', `${join(home, '.nvm/lib/node_modules')}\n`],
    ['npm ls -g --json --depth=0', JSON.stringify({ dependencies: { '@openai/codex': { version: '0.150.0' } } })],
    ['gh api repos/cli/cli --jq {full_name: .full_name, stars: .stargazers_count, archived: .archived}', '{"archived":false,"full_name":"cli/cli","stars":46700}\n'],
    ['gh api repos/openai/codex --jq {full_name: .full_name, stars: .stargazers_count, archived: .archived}', '{"archived":false,"full_name":"openai/codex","stars":128100}\n'],
    ['npm view @openai/codex deprecated --json', '"Use the standalone installer."\n'],
  ]);
  const calls: string[] = [];
  const probe: CliProbe = async (argv) => {
    calls.push(argv.join(' '));
    return outputs.get(argv.join(' ')) ?? null;
  };
  const env = { HOME: home, PATH: [join(home, '.nvm/bin'), join(brew, 'bin'), '/usr/bin'].join(':') };
  return { root, home, env, probe, calls };
}

describe('cli inventory collector', () => {
  test('lists PATH tools from read-only manager output, with stars and deprecation, and no local path', async () => {
    const { root, env, probe, calls } = machine();
    const repo = join(root, 'repo');
    mkdirSync(repo);
    appendSegmentedLog(join(repo, HOOK_EVENT_TELEMETRY_PATH), `${JSON.stringify({ started_at: '2026-10-25T00:00:00.000Z', command_names: ['gh'] })}\n`, repo);
    const snapshot = decodeCliInventory(await collectCliInventory({
      env, probe, now: () => NOW, usage_sources: [{ repo_root: repo, telemetry_path: HOOK_EVENT_TELEMETRY_PATH }],
    }));
    const entries = new Map(snapshot.entries.map(entry => [entry.id, entry]));
    expect([...entries.keys()]).toEqual(['npm:@openai/codex', 'brew:gh']);
    expect(entries.get('brew:gh')).toMatchObject({
      version: '2.60.0', unused: false, last_used_at: '2026-10-25T00:00:00.000Z', location: '[private path]',
      github: { repo: 'cli/cli', stars: 46_700 }, uninstall: { steps: ['brew uninstall gh'] },
    });
    expect(entries.get('npm:@openai/codex')).toMatchObject({
      version: '0.150.0', unused: true, deprecated: true, location: '~/.nvm/bin', size_bytes: expect.any(Number),
      github: { repo: 'openai/codex', stars: 128_100 }, uninstall: { steps: ['npm rm -g @openai/codex'], config: 'rm -rf ~/.codex' },
    });
    expect(JSON.stringify(snapshot)).not.toContain(root);
    // Only read-only listings and lookups; no uninstall and no shell history.
    expect(calls.every(call => /^(brew (--prefix|info)|npm (root|ls|view)|pnpm ls|pipx list|uv tool (dir|list)|cargo install --list|mise ls|go env|gh api)(?: |$)/u.test(call))).toBe(true);
    expect(calls.some(call => call.includes('history'))).toBe(false);
  });

  test('a gh full_name that is not owner/repo is not used', async () => {
    const { env, probe: base } = machine();
    const probe: CliProbe = async (argv) => (argv[0] === 'gh'
      ? '{"archived":false,"full_name":"../../etc passwd","stars":1}\n'
      : base(argv));
    const snapshot = await collectCliInventory({ env, probe, now: () => NOW });
    expect(() => decodeCliInventory(snapshot)).not.toThrow();
    expect(snapshot.entries.find(entry => entry.id === 'brew:gh')?.github).toMatchObject({ repo: 'cli/cli', stars: null, moved: false });
  });

  test('network lookups are cached for 24 hours', async () => {
    const { env, probe, calls } = machine();
    const cache = createCliInventoryCache();
    const lookups = () => calls.filter(call => call.startsWith('gh api') || call.startsWith('npm view')).length;
    await collectCliInventory({ env, probe, cache, now: () => NOW });
    expect(lookups()).toBe(3);
    await collectCliInventory({ env, probe, cache, now: () => NOW + 23 * 3_600_000 });
    expect(lookups()).toBe(3);
    await collectCliInventory({ env, probe, cache, now: () => NOW + 25 * 3_600_000 });
    expect(lookups()).toBe(6);
  });

  test('the collector probes in the background; read() only returns the cache', async () => {
    const { env, probe, calls } = machine();
    const collector = startCliInventoryCollector({ env, probe, now: () => NOW });
    try {
      expect(collector.read()).toMatchObject({ status: 'unavailable', reason: 'collection_pending' });
      await collector.settled();
      const probes = calls.length;
      for (let index = 0; index < 3; index += 1) expect(collector.read().status).toBe('ready');
      expect(calls.length).toBe(probes);
    } finally {
      await collector.close();
    }
  });
});
