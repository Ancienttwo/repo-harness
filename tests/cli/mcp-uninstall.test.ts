import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { runMcpSetupChatgpt, runMcpSetupCodex } from '../../src/cli/mcp/setup';
import { runMcpUninstall } from '../../src/cli/mcp/uninstall';
import { readRepoHarnessRegistryStrictSnapshot, registerRepoHarnessRepo, setRepoHarnessAccessMode } from '../../src/effects/repo-registry';
import { readConfigurationReceipt, saveConfigurationReceipt } from '../../src/cli/installer/configuration-ownership';

function fixture(run: (repo: string, store: string) => void) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'mcp-uninstall-')));
  const repo = join(root, 'repo'), store = join(root, 'storage');
  mkdirSync(join(repo, '.ai/harness'), { recursive: true });
  writeFileSync(join(repo, '.ai/harness/policy.json'), '{}');
  const before = process.env.REPO_HARNESS_HOME;
  process.env.REPO_HARNESS_HOME = store;
  try { run(repo, store); } finally {
    if (before === undefined) delete process.env.REPO_HARNESS_HOME; else process.env.REPO_HARNESS_HOME = before;
    rmSync(root, { recursive: true, force: true });
  }
}
function tree(path: string): string {
  if (!existsSync(path)) return 'absent';
  return JSON.stringify(readdirSync(path, { recursive: true }).sort().map((name) => {
    const full = join(path, String(name));
    try { return [name, readFileSync(full, 'utf8')]; } catch { return [name, 'directory']; }
  }));
}
const offline = { target: 'chatgpt', servicesStopped: true };

describe('MCP setup uninstall', () => {
  test('fresh roundtrip preserves workspaces/static bytes and removes dedicated credentials', () => fixture((repo, store) => {
    runMcpSetupChatgpt({ repo, profile: 'coding', grantReadWrite: [repo] });
    runMcpSetupCodex({ repo });
    writeFileSync(join(store, 'mcp.oauth-tokens.json'), '{"secret":"credential-sentinel-937"}');
    writeFileSync(join(store, 'mcp.oauth-doctor-client.json'), '{"version":1,"clientId":"client-doctor-sentinel"}');
    writeFileSync(join(store, 'mcp-workspaces.json'), 'workspace sentinel');
    const previewBefore = tree(store) + tree(repo);
    expect(runMcpUninstall({ repo, dryRun: true }).status).toBe('complete');
    expect(tree(store) + tree(repo)).toBe(previewBefore);
    const result = runMcpUninstall({ repo, servicesStopped: true });
    expect(result.status).toBe('complete');
    expect(result.scope).toBe('local_configuration');
    expect(JSON.stringify(result)).not.toContain('credential-sentinel-937');
    for (const name of ['mcp.local.json', 'mcp.tokens.json', 'mcp.oauth.json', 'mcp.oauth-doctor-client.json', 'mcp.oauth-tokens.json']) expect(existsSync(join(store, name))).toBe(false);
    expect(readFileSync(join(store, 'mcp-workspaces.json'), 'utf8')).toBe('workspace sentinel');
    expect(existsSync(join(repo, '.codex/config.toml'))).toBe(false);
    expect(readRepoHarnessRegistryStrictSnapshot().repos).toEqual([]);
    expect(runMcpUninstall({ repo, servicesStopped: true }).status).toBe('complete');
  }));
  test('dry-run on an empty installation creates no directories', () => fixture((repo, store) => {
    const before = tree(repo);
    expect(runMcpUninstall({ repo, dryRun: true }).status).toBe('complete');
    expect(existsSync(store)).toBe(false);
    expect(tree(repo)).toBe(before);
  }));
  test('ChatGPT apply fails before writes unless services are explicitly stopped', () => fixture((repo, store) => {
    runMcpSetupChatgpt({ repo });
    const before = tree(store);
    expect(runMcpUninstall({ repo, target: 'chatgpt' }).status).toBe('partial');
    expect(tree(store)).toBe(before);
  }));
  test('Codex restores prior registration and preserves later sibling edits', () => fixture((repo) => {
    const path = join(repo, '.codex/config.toml');
    mkdirSync(join(repo, '.codex'));
    writeFileSync(path, '[mcp_servers.repo_harness]\ncommand = "original"\n');
    runMcpSetupCodex({ repo });
    writeFileSync(path, readFileSync(path, 'utf8') + '\n[profiles.mine]\nmodel = "mine"\n');
    expect(runMcpUninstall({ repo, target: 'codex' }).status).toBe('complete');
    const parsed = Bun.TOML.parse(readFileSync(path, 'utf8')) as any;
    expect(parsed.mcp_servers.repo_harness.command).toBe('original');
    expect(parsed.profiles.mine.model).toBe('mine');
    expect(runMcpUninstall({ repo, target: 'codex' }).status).toBe('complete');
  }));
  test('edited and unproven Codex registration is retained', () => fixture((repo) => {
    runMcpSetupCodex({ repo });
    const path = join(repo, '.codex/config.toml');
    const edited = readFileSync(path, 'utf8').replace('command = "repo-harness"', 'command = "user"');
    writeFileSync(path, edited);
    expect(runMcpUninstall({ repo, target: 'codex' }).status).toBe('partial');
    expect(readFileSync(path, 'utf8')).toBe(edited);
  }));
  test('interrupted project setup needs explicit recovery', () => fixture((repo) => {
    runMcpSetupCodex({ repo });
    const env = { HOME: repo }, receipt = readConfigurationReceipt(env);
    const path = join(repo, '.codex/config.toml');
    receipt.pending = { id: 'interrupted', before: [{ path, selector: 'mcp_servers.repo_harness', value: receipt.changes[0]!.installed }] };
    saveConfigurationReceipt(receipt, env);
    writeFileSync(path, '[mcp_servers.repo_harness]\ncommand = "half-written"\n');
    expect(runMcpUninstall({ repo, target: 'codex' }).status).toBe('partial');
    expect(runMcpUninstall({ repo, target: 'codex', recoverInterrupted: true }).status).toBe('complete');
  }));
  test('registry restores preexisting shared registration without losing another repo', () => fixture((repo, store) => {
    registerRepoHarnessRepo(repo, 'init');
    const original = readRepoHarnessRegistryStrictSnapshot().repos[0];
    runMcpSetupChatgpt({ repo, profile: 'coding', grantReadWrite: [repo] });
    const other = resolve(repo, '../other');
    mkdirSync(join(other, '.ai/harness'), { recursive: true });
    writeFileSync(join(other, '.ai/harness/policy.json'), '{}');
    registerRepoHarnessRepo(other, 'init');
    expect(runMcpUninstall({ repo, ...offline }).status).toBe('complete');
    const rows = readRepoHarnessRegistryStrictSnapshot().repos;
    expect(rows.find((row) => row.path === repo)).toEqual(original);
    expect(rows.find((row) => row.path === other)?.source).toBe('init');
    expect(existsSync(join(store, 'mcp.tokens.json'))).toBe(false);
  }));
  test('user-edited registry authorization is preserved and reported', () => fixture((repo) => {
    runMcpSetupChatgpt({ repo });
    setRepoHarnessAccessMode(repo, 'read_write');
    expect(runMcpUninstall({ repo, ...offline }).status).toBe('partial');
    expect(readRepoHarnessRegistryStrictSnapshot().repos[0]?.accessMode).toBe('read_write');
  }));
  test('unproven manual grants are never reset', () => fixture((repo) => {
    setRepoHarnessAccessMode(repo, 'read_write');
    expect(runMcpUninstall({ repo, ...offline }).status).toBe('partial');
    expect(readRepoHarnessRegistryStrictSnapshot().repos[0]?.accessMode).toBe('read_write');
  }));
  test('malformed shared registry aborts before credential deletion', () => fixture((repo, store) => {
    runMcpSetupChatgpt({ repo });
    writeFileSync(join(store, 'registered-repos.json'), '{broken');
    expect(runMcpUninstall({ repo, ...offline }).status).toBe('partial');
    expect(existsSync(join(store, 'mcp.tokens.json'))).toBe(true);
  }));
  test('symlink credential aborts cleanup without touching the target', () => fixture((repo, store) => {
    runMcpSetupChatgpt({ repo });
    const outside = join(repo, 'outside');
    writeFileSync(outside, 'secret sentinel');
    rmSync(join(store, 'mcp.tokens.json'));
    symlinkSync(outside, join(store, 'mcp.tokens.json'));
    expect(runMcpUninstall({ repo, ...offline }).status).toBe('partial');
    expect(readFileSync(outside, 'utf8')).toBe('secret sentinel');
    expect(existsSync(join(store, 'mcp.local.json'))).toBe(true);
  }));
  test('target isolation leaves other setup untouched', () => fixture((repo, store) => {
    runMcpSetupChatgpt({ repo });
    runMcpSetupCodex({ repo });
    expect(runMcpUninstall({ repo, target: 'codex' }).status).toBe('complete');
    expect(existsSync(join(store, 'mcp.local.json'))).toBe(true);
  }));
  test('reinstall starts from the current user registration after a completed teardown', () => fixture((repo) => {
    runMcpSetupChatgpt({ repo });
    expect(runMcpUninstall({ repo, ...offline }).status).toBe('complete');
    registerRepoHarnessRepo(repo, 'manual');
    const user = readRepoHarnessRegistryStrictSnapshot().repos[0];
    runMcpSetupChatgpt({ repo });
    expect(runMcpUninstall({ repo, ...offline }).status).toBe('complete');
    expect(readRepoHarnessRegistryStrictSnapshot().repos[0]).toEqual(user);
    expect(runMcpUninstall({ repo, ...offline }).status).toBe('complete');
  }));
  test('old setup without receipt preserves registrations and reports ownership gap', () => fixture((repo, store) => {
    runMcpSetupChatgpt({ repo });
    rmSync(join(store, 'mcp-setup-restore.json'));
    expect(runMcpUninstall({ repo, ...offline }).status).toBe('partial');
    expect(readRepoHarnessRegistryStrictSnapshot().repos.length).toBe(1);
    expect(existsSync(join(store, 'mcp.tokens.json'))).toBe(false);
  }));

});
