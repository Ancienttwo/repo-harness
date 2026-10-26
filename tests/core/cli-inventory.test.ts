import { describe, expect, test } from 'bun:test';

import seedJson from '../../src/core/setup/cli-seed.v1.json';
import {
  CLI_SEED,
  decodeCliInventory,
  decodeCliSeed,
  githubRepo,
  projectCliInventory,
  unavailableCliInventory,
  type CliInventoryInput,
  type CliInventorySnapshotV1,
} from '../../src/core/setup/cli-inventory';

const HOME = '/Users/alice';
const NOW = Date.parse('2026-10-26T00:00:00.000Z');
const DAY = 86_400_000;
const exe = (path: string, real_path = path) => ({ name: path.slice(path.lastIndexOf('/') + 1), path, real_path });

function input(overrides: Partial<CliInventoryInput> = {}): CliInventoryInput {
  return {
    collected_at: new Date(NOW).toISOString(),
    home: HOME,
    seed: CLI_SEED,
    packages: [
      { source: 'brew', dependency: false, name: 'gh', version: '2.60.0', roots: ['/opt/homebrew/Cellar/gh'], files: [], deprecated: false,
        urls: ['https://cli.github.com/', 'https://github.com/cli/cli/archive/refs/tags/v2.60.0.tar.gz'] },
      { source: 'brew', dependency: false, name: 'stripe/stripe-cli/stripe', version: '1.21.0', roots: ['/opt/homebrew/Cellar/stripe'], files: [], deprecated: false, urls: [] },
      { source: 'npm', dependency: false, name: '@openai/codex', version: '0.150.0', roots: [`${HOME}/.nvm/lib/node_modules/@openai/codex`], files: [], deprecated: false,
        urls: ['git+https://github.com/openai/codex.git'] },
      { source: 'npm', dependency: false, name: 'neonctl', version: '2.1.0', roots: [`${HOME}/.nvm/lib/node_modules/neonctl`], files: [], deprecated: false,
        urls: ['git+https://github.com/neondatabase/neonctl.git'] },
      { source: 'npm', dependency: false, name: 'opencode-ai', version: '1.0.0', roots: [`${HOME}/.nvm/lib/node_modules/opencode-ai`], files: [], deprecated: false,
        urls: ['https://github.com/sst/opencode'] },
      { source: 'go', dependency: false, name: 'github.com/charmbracelet/crush', version: 'v0.9.0', roots: [], files: [`${HOME}/go/bin/crush`], deprecated: false,
        urls: ['https://github.com/charmbracelet/crush'] },
      // A dependency claims its PATH file and is not listed.
      { source: 'brew', dependency: true, name: 'openssl@3', version: '3.0', roots: ['/opt/homebrew/Cellar/openssl@3'], files: [], deprecated: false, urls: [] },
      // A library: no file on PATH, so it is not listed.
      { source: 'npm', dependency: false, name: 'left-pad', version: '1.3.0', roots: [`${HOME}/.nvm/lib/node_modules/left-pad`], files: [], deprecated: false, urls: [] },
      // A name that would break the command template is dropped; its file stays as a manual file.
      { source: 'npm', dependency: false, name: 'evil; rm -rf ~', version: '1.0.0', roots: [`${HOME}/.nvm/lib/node_modules/evil`], files: [], deprecated: false, urls: [] },
    ],
    path_executables: [
      exe('/opt/homebrew/bin/gh', '/opt/homebrew/Cellar/gh/2.60.0/bin/gh'),
      exe('/opt/homebrew/bin/stripe', '/opt/homebrew/Cellar/stripe/1.21.0/bin/stripe'),
      exe('/opt/homebrew/bin/openssl', '/opt/homebrew/Cellar/openssl@3/3.0/bin/openssl'),
      exe(`${HOME}/.nvm/bin/codex`, `${HOME}/.nvm/lib/node_modules/@openai/codex/bin/codex.js`),
      exe(`${HOME}/.nvm/bin/neonctl`, `${HOME}/.nvm/lib/node_modules/neonctl/dist/cli.js`),
      exe(`${HOME}/.nvm/bin/opencode`, `${HOME}/.nvm/lib/node_modules/opencode-ai/bin/opencode`),
      exe(`${HOME}/.nvm/bin/evil`, `${HOME}/.nvm/lib/node_modules/evil/bin/evil`),
      exe(`${HOME}/go/bin/crush`),
      exe(`${HOME}/.local/bin/claude`, `${HOME}/.local/share/claude/versions/2.1.0/claude`),
      exe(`${HOME}/bin/asc`),
      exe('/opt/tools/bin/secretcli'),
      // Shadowed by the first gh, a system file, and a project binary.
      exe(`${HOME}/.local/bin/gh`),
      exe('/usr/bin/git'),
      exe(`${HOME}/repo/node_modules/.bin/wrangler`),
    ],
    last_used: new Map([['gh', NOW - DAY], ['claude', NOW - 100 * DAY]]),
    github: new Map([
      ['cli/cli', { full_name: 'cli/cli', stars: 46_700, archived: false }],
      ['neondatabase/neonctl', { full_name: 'neondatabase/neonctl', stars: 900, archived: true }],
      ['sst/opencode', { full_name: 'anomalyco/opencode', stars: 221_800, archived: false }],
    ]),
    registry_deprecated: new Map([['npm:@openai/codex', false]]),
    sizes: new Map([['/opt/homebrew/Cellar/gh', 52_000_000]]),
    ...overrides,
  };
}

const byId = (snapshot: CliInventorySnapshotV1) => new Map(snapshot.entries.map(entry => [entry.id, entry]));

describe('cli seed', () => {
  test('the packaged seed decodes', () => {
    expect(CLI_SEED.tools.map(tool => tool.id)).toContain('claude-code');
    expect(CLI_SEED.tools.filter(tool => tool.commands.includes('asc')).map(tool => tool.repo)).toEqual(['rorkai/App-Store-Connect-CLI', 'tddworks/asc-cli']);
  });

  test('a seed template with shell expansion or a package name with a space fails', () => {
    const copy = (change: (tool: any) => void) => {
      const seed = structuredClone(seedJson) as any;
      change(seed.tools[0]);
      return seed;
    };
    expect(() => decodeCliSeed(copy(tool => { tool.script_uninstall = ['rm -rf $HOME/.x']; }))).toThrow('script_uninstall');
    expect(() => decodeCliSeed(copy(tool => { tool.packages = [{ registry: 'npm', name: 'a b' }]; }))).toThrow('package name');
    expect(() => decodeCliSeed(copy(tool => { tool.install_roots = ['/opt/x']; }))).toThrow('install_root');
    expect(() => decodeCliSeed(copy(tool => { tool.extra = true; }))).toThrow('tool fields');
  });
});

describe('cli inventory projection', () => {
  test('groups PATH files by the package that owns them and skips system, project and shadowed files', () => {
    const entries = byId(decodeCliInventory(projectCliInventory(input())));
    expect([...entries.keys()]).toEqual([
      'brew:gh', 'brew:stripe/stripe-cli/stripe', 'npm:@openai/codex', 'npm:neonctl', 'npm:opencode-ai', 'manual:evil',
      'go:github.com/charmbracelet/crush', 'script:claude-code', 'manual:asc', 'manual:secretcli',
    ]);
    expect(entries.get('brew:gh')).toMatchObject({
      version: '2.60.0', commands: ['gh'], size_bytes: 52_000_000, unused: false, last_used_at: '2026-10-25T00:00:00.000Z',
      github: { repo: 'cli/cli', stars: 46_700, archived: false, monorepo: false, moved: false, candidates: [] },
      uninstall: { steps: ['brew uninstall gh'], config: null },
    });
  });

  test('renders uninstall commands from source templates and the seed, never running them', () => {
    const entries = byId(projectCliInventory(input()));
    expect(entries.get('brew:stripe/stripe-cli/stripe')?.uninstall).toEqual({
      steps: ['stripe plugin uninstall --all', 'stripe logout --all', 'brew uninstall stripe/stripe-cli/stripe'], config: 'rm -rf ~/.config/stripe',
    });
    expect(entries.get('npm:@openai/codex')?.uninstall).toEqual({ steps: ['npm rm -g @openai/codex'], config: 'rm -rf ~/.codex' });
    expect(entries.get('script:claude-code')?.uninstall).toEqual({
      steps: ['rm -f ~/.local/bin/claude && rm -rf ~/.local/share/claude'], config: 'rm -rf ~/.claude ~/.claude.json',
    });
    expect(entries.get('go:github.com/charmbracelet/crush')?.uninstall?.steps).toEqual(['rm ~/go/bin/crush']);
    expect(entries.get('manual:secretcli')?.uninstall).toBeNull();
    expect(entries.get('manual:evil')?.uninstall).toBeNull();
    expect(JSON.stringify([...entries.values()])).not.toContain('evil;');
  });

  test('a Go uninstall removes every grouped binary and quotes an unsafe ~ path', () => {
    const go = (files: string[]) => projectCliInventory(input({
      packages: [{ source: 'go', dependency: false, name: 'example.com/tools', version: 'v1.0.0', roots: [], files, deprecated: false, urls: [] }],
      path_executables: files.map(path => exe(path)),
    })).entries[0]?.uninstall?.steps;
    expect(go([`${HOME}/go/bin/toolone`, `${HOME}/go/bin/tooltwo`])).toEqual(['rm ~/go/bin/toolone ~/go/bin/tooltwo']);
    expect(go([`${HOME}/my tools/bin/toolone`])).toEqual([`rm ~/'my tools/bin/toolone'`]);
    expect(go([`${HOME}/a;touch x'b/bin/toolone`])).toEqual([`rm ~/'a;touch x'\\''b/bin/toolone'`]);
    expect(go(['/opt/go/bin/toolone'])).toBeUndefined();
    // A path the public-text filter would rewrite gets no command, never a command for another file.
    expect(go([`${HOME}/x=/bin/toolone`])).toBeUndefined();
    expect(go([`${HOME}/a (/bin/toolone`])).toBeUndefined();
  });

  test('shows local paths only as ~ paths or [private path]', () => {
    const snapshot = projectCliInventory(input());
    const entries = byId(snapshot);
    expect(entries.get('npm:@openai/codex')?.location).toBe('~/.nvm/bin');
    expect(entries.get('brew:gh')?.location).toBe('[private path]');
    expect(entries.get('manual:secretcli')?.location).toBe('[private path]');
    const text = JSON.stringify(snapshot);
    for (const leak of [HOME, '/opt/', '/usr/bin', 'left-pad', 'wrangler', 'openssl']) expect(text).not.toContain(leak);
  });

  test('marks unused tools, archived or moved repositories and ambiguous commands', () => {
    const entries = byId(projectCliInventory(input()));
    expect(entries.get('npm:@openai/codex')).toMatchObject({ unused: true, last_used_at: null, deprecated: false });
    expect(entries.get('script:claude-code')).toMatchObject({ unused: true, last_used_at: '2026-07-18T00:00:00.000Z' });
    expect(entries.get('npm:neonctl')).toMatchObject({ deprecated: true, github: { archived: true } });
    expect(entries.get('npm:opencode-ai')?.github).toMatchObject({ repo: 'anomalyco/opencode', moved: true, stars: 221_800 });
    expect(entries.get('manual:asc')?.github).toEqual({
      repo: null, candidates: ['rorkai/App-Store-Connect-CLI', 'tddworks/asc-cli'], monorepo: false, stars: null, archived: null, moved: false,
    });
  });

  test('reads GitHub repositories from npm, Homebrew and shorthand metadata', () => {
    expect(githubRepo('git+https://github.com/openai/codex.git')).toBe('openai/codex');
    expect(githubRepo('git@github.com:cli/cli.git')).toBe('cli/cli');
    expect(githubRepo('github:vercel/vercel')).toBe('vercel/vercel');
    expect(githubRepo('https://github.com/cli/cli/archive/refs/tags/v1.tar.gz')).toBe('cli/cli');
    expect(githubRepo('https://cli.github.com/')).toBeNull();
    expect(githubRepo('https://gitlab.com/a/b')).toBeNull();
  });
});

describe('cli inventory decoder', () => {
  const rejects = (mutate: (snapshot: any, entry: (id: string) => any) => void) => {
    const snapshot = structuredClone(projectCliInventory(input())) as any;
    mutate(snapshot, id => snapshot.entries.find((item: any) => item.id === id));
    expect(() => decodeCliInventory(snapshot)).toThrow('cli inventory invalid');
  };

  test('accepts the pending shape and rejects leaks and inconsistent facts', () => {
    expect(decodeCliInventory(unavailableCliInventory()).status).toBe('unavailable');
    rejects(s => { s.entries[0].location = '/opt/homebrew/bin'; });
    rejects(s => { s.entries[0].uninstall.steps = ['rm -rf /Users/alice/.x']; });
    rejects(s => { s.entries[0].github = { repo: null, candidates: [], monorepo: false, stars: 1, archived: null, moved: false }; });
    rejects((_, entry) => { entry('manual:asc').github.stars = 10; });
    rejects(s => { s.entries[0].commands = []; });
    rejects(s => { s.entries[0].args = 'pr view'; });
    rejects(s => { s.entries.push({ ...s.entries[0] }); });
    rejects(s => { Object.assign(s, unavailableCliInventory(), { entries: s.entries }); });
  });
});
