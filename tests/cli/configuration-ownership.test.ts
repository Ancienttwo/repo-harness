import { test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, symlinkSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { configurationReceiptPath, readConfigurationReceipt, writeOwnedConfiguration, recordConfigurationChange, readConfigurationFragment, replaceConfigurationFragment } from '../../src/cli/installer/configuration-ownership';

function fixture(run: (home: string, env: NodeJS.ProcessEnv) => void) {
  const home = mkdtempSync(join(tmpdir(), 'configuration-ownership-'));
  try { run(home, { HOME: home }); } finally { rmSync(home, { recursive: true, force: true }); }
}
test('issue 698 TOML fragment selects the root key and preserves profile keys', () => fixture((home) => {
  const path = join(home, '.codex/config.toml');
  const raw = 'default_mode_request_user_input = false\n[profiles.work]\ndefault_mode_request_user_input = false\n';
  expect(readConfigurationFragment(path, raw, 'default_mode_request_user_input')).toBe('default_mode_request_user_input = false\n');
  const next = replaceConfigurationFragment(path, raw, 'default_mode_request_user_input', 'default_mode_request_user_input = true\n');
  expect(next).toBe('default_mode_request_user_input = true\n[profiles.work]\ndefault_mode_request_user_input = false\n');
  expect(replaceConfigurationFragment(path, next, 'default_mode_request_user_input', 'default_mode_request_user_input = false\n')).toBe(raw);
}));

test('issue 698 ambiguous top-level TOML keys refuse a fragment mutation', () => fixture((home) => {
  const path = join(home, '.codex/config.toml');
  const raw = 'default_mode_request_user_input = false\ndefault_mode_request_user_input = true\n';
  expect(() => replaceConfigurationFragment(path, raw, 'default_mode_request_user_input', 'default_mode_request_user_input = true\n')).toThrow();
}));
test('records earliest original and private receipt across repeat installs', () => fixture((home, env) => {
  const path = join(home, '.codex/config.toml');
  mkdirSync(join(home, '.codex'));
  writeFileSync(path, 'default_mode_request_user_input = false\nmodel = "user"\n');
  writeOwnedConfiguration(path, 'default_mode_request_user_input = true\nmodel = "user"\n', env);
  writeOwnedConfiguration(path, readFileSync(path, 'utf8'), env);
  expect(readConfigurationReceipt(env).changes).toHaveLength(1);
  expect(readConfigurationReceipt(env).changes[0]!.before).toBe('default_mode_request_user_input = false\n');
  expect(statSync(configurationReceiptPath(env)).mode & 0o777).toBe(0o600);
}));
test('refuses receipt path symlinks before writing configuration', () => fixture((home, env) => {
  mkdirSync(join(home, '.repo-harness'));
  const victim = join(home, 'victim'); writeFileSync(victim, 'untouched');
  symlinkSync(victim, configurationReceiptPath(env));
  expect(() => writeOwnedConfiguration(join(home, '.codex/config.toml'), 'default_mode_request_user_input = true\n', env)).toThrow();
  expect(readFileSync(victim, 'utf8')).toBe('untouched');
  expect(existsSync(join(home, '.codex/config.toml'))).toBe(false);
}));
test('rejects modified original before overwriting it', () => fixture((home, env) => {
  const path = join(home, '.codex/config.toml');
  writeOwnedConfiguration(path, 'default_mode_request_user_input = true\n', env);
  writeFileSync(path, 'default_mode_request_user_input = false\n');
  expect(() => writeOwnedConfiguration(path, 'default_mode_request_user_input = true\n', env)).toThrow('changed since installation');
  expect(readFileSync(path, 'utf8')).toContain('false');
}));
test('records only CodeGraph keys, never sibling secrets', () => fixture((home, env) => {
  const path = join(home, '.claude.json');
  recordConfigurationChange(path, JSON.stringify({ secret: 'dont-copy', mcpServers: { user: { command: 'user' } } }), JSON.stringify({ secret: 'dont-copy', mcpServers: { user: { command: 'user' }, codegraph: { command: 'cg' } } }), env);
  expect(readFileSync(configurationReceiptPath(env), 'utf8')).not.toContain('dont-copy');
  expect(readConfigurationReceipt(env).changes[0]!.selector).toBe('mcpServers.codegraph');
}));

test('interrupted external writer retains durable preimage and blocks implicit cleanup', async () => {
  const home = mkdtempSync(join(tmpdir(), 'configuration-kill-'));
  const env = { ...process.env, HOME: home, BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0' };
  try {
    const path = join(home, '.codex/config.toml');
    mkdirSync(join(home, '.codex'));
    writeFileSync(path, 'model = "original"\n');
    const modulePath = join(import.meta.dir, '../../src/cli/installer/configuration-ownership.ts');
    const child = Bun.spawn(['bun', '-e', `import {withConfigurationMutation} from ${JSON.stringify(modulePath)}; import {writeFileSync} from 'fs'; withConfigurationMutation([${JSON.stringify(path)}], process.env, () => {writeFileSync(${JSON.stringify(path)}, 'model = "original"\\n[mcp_servers.codegraph]\\ncommand = "cg"\\n'); process.kill(process.pid, 'SIGKILL');});`], { env, stdout: 'pipe', stderr: 'pipe' });
    expect(await child.exited).not.toBe(0);
    const receipt = readConfigurationReceipt(env);
    expect(JSON.stringify(receipt.pending)).not.toContain('model');
    expect(receipt.pending?.before.find(entry => entry.selector === 'mcp_servers.codegraph')?.value).toBe(null);
    const before = readFileSync(path, 'utf8');
    const { runUserUninstall } = await import('../../src/cli/installer/uninstall');
    expect(runUserUninstall({ target: 'both', env }).status).toBe('partial');
    expect(readFileSync(path, 'utf8')).toBe(before);
    expect(() => writeOwnedConfiguration(path, 'model = "replacement"\n', env)).toThrow('interrupted');
    const receiptBefore = readFileSync(configurationReceiptPath(env), 'utf8');
    expect(runUserUninstall({target:'both',env,dryRun:true,recoverInterrupted:true}).status).toBe('complete');
    expect(readFileSync(configurationReceiptPath(env), 'utf8')).toBe(receiptBefore);
    expect(runUserUninstall({target:'both',env,recoverInterrupted:true}).status).toBe('complete');
    expect(readFileSync(path,'utf8')).toBe('model = "original"\n');
    expect(readConfigurationReceipt(env).pending).toBeUndefined();
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('shared host lock serializes concurrent writers and retains both host receipts', async () => {
  const home = mkdtempSync(join(tmpdir(), 'configuration-lock-'));
  const env = { ...process.env, HOME: home, BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0' };
  try {
    const modulePath = join(import.meta.dir, '../../src/cli/installer/configuration-ownership.ts');
    const lockPath = join(import.meta.dir, '../../src/cli/installer/runtime-host-lock.ts');
    const signal = join(home, 'locked');
    const code = (host: string, delay: number) => `import {withRuntimeHostTransactionLock} from ${JSON.stringify(lockPath)}; import {writeOwnedConfiguration} from ${JSON.stringify(modulePath)}; import {writeFileSync} from 'fs'; withRuntimeHostTransactionLock(process.env,()=>{writeFileSync(${JSON.stringify(signal)},'ready'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,${delay}); writeOwnedConfiguration(${JSON.stringify(join(home, host === 'codex' ? '.codex/config.toml' : '.claude.json'))},${JSON.stringify(host === 'codex' ? 'default_mode_request_user_input = true\n' : '{"mcpServers":{"codegraph":{"command":"cg"}}}')},process.env);});`;
    const first = Bun.spawn(['bun', '-e', code('codex', 500)], { env, stdout: 'pipe', stderr: 'pipe' });
    const deadline = Date.now() + 3000;
    while (!existsSync(signal) && Date.now() < deadline) await Bun.sleep(5);
    expect(existsSync(signal)).toBe(true);
    const second = Bun.spawn(['bun', '-e', code('claude', 0)], { env, stdout: 'pipe', stderr: 'pipe' });
    expect(await second.exited).toBe(0);
    expect(await first.exited).toBe(0);
    const retry = Bun.spawn(['bun', '-e', code('claude', 0)], { env, stdout: 'pipe', stderr: 'pipe' });
    expect(await retry.exited).toBe(0);
    expect(readConfigurationReceipt(env).changes).toHaveLength(2);
    const { runUserUninstall } = await import('../../src/cli/installer/uninstall');
    expect(runUserUninstall({ target: 'both', env }).status).toBe('complete');
  } finally { rmSync(home, { recursive: true, force: true }); }
});
