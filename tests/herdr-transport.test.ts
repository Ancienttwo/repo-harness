import { expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, symlinkSync, rmSync } from 'fs';
import { spawn } from 'child_process';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { herdrCommand, herdrEnvironment, herdrResult, validateHerdrEndpoint } from '../src/effects/terminal/herdr';
import { buildAgentRuntimeEffectIntent, buildAgentRuntimeHostAction } from '../src/core/engineers/agent-runtime-effect';
import { executeHerdrCliAgentAction } from '../src/effects/engineers/agent-runtime-adapters/herdr-cli-agent';

const quote = (s: string) => "'" + s.replaceAll("'", "'\\''") + "'";
async function until(check: () => boolean) {
  for (let i = 0; i < 80; i++) { if (check()) return; await Bun.sleep(100); }
  throw new Error('herdr fixture condition timed out');
}

test('real herdr submits busy and multiline input, rejects blocked or exited peers, and reconnects without replay', async () => {
  // Keep both native socket paths below sun_path even with the runner's nested TMPDIR.
  const root = mkdtempSync('/tmp/rh-herdr-input-');
  const endpoint = { session: `input-${randomUUID().slice(0, 8)}`, home: root, configPath: join(root, 'herdr.toml'), agentName: 'fixture-peer' };
  validateHerdrEndpoint(endpoint);
  writeFileSync(endpoint.configPath, 'onboarding = false\n[terminal]\ndefault_shell = "/bin/sh"\nshell_mode = "non_login"\n[update]\nversion_check = false\nmanifest_check = false\n');
  const received = join(root, 'input.bin');
  const ready = join(root, 'ready');
  // A deterministic raw-input consumer under the recognized executable name tests
  // Herdr's real PTY/protocol. It is not an actual Codex model or provider receipt.
  symlinkSync(process.execPath, join(root, 'codex'));
  writeFileSync(join(root, 'peer.ts'), `import {appendFileSync,writeFileSync} from 'fs'; process.stdin.setRawMode(true); process.stdout.write('\\x1b[?2004h'); writeFileSync(${JSON.stringify(ready)},'ready'); process.stdin.on('data',chunk=>appendFileSync(${JSON.stringify(received)},chunk));`);
  const server = spawn('herdr', ['--session', endpoint.session, 'server'], { env: herdrEnvironment(endpoint), stdio: 'ignore' });
  const call = (args: string[]) => herdrResult(herdrCommand(endpoint, args));
  try {
    await until(() => { try { call(['workspace', 'list']); return true; } catch { return false; } });
    const pane = call(['workspace', 'create', '--cwd', root, '--no-focus']).root_pane.pane_id;
    expect(herdrCommand(endpoint, ['pane', 'run', pane, `exec ${quote(join(root, 'codex'))} ${quote(join(root, 'peer.ts'))}`]).status).toBe(0);
    await until(() => existsSync(ready));
    await until(() => { try { return call(['agent', 'get', pane]).agent?.agent === 'codex'; } catch { return false; } });
    expect(herdrCommand(endpoint, ['pane', 'report-agent', pane, '--source', 'fixture', '--agent', 'codex', '--state', 'working', '--seq', '1']).status).toBe(0);
    expect(herdrCommand(endpoint, ['agent', 'rename', pane, endpoint.agentName]).status).toBe(0);
    const digest = `sha256:${'a'.repeat(64)}`;
    const action = buildAgentRuntimeHostAction(buildAgentRuntimeEffectIntent({
      idempotency_key: 'live-herdr-input', operation: 'notify_inbox', capability_sha256: digest, created_at: '2026-09-09T00:00:00.000Z',
      message_ref: { kind: 'module_message', message_id: randomUUID(), message_event_digest: digest, engineer_id: 'engineer:capability.verification.evals-checks', binding_id: '11111111-1111-4111-8111-111111111111', binding_generation: 1, engineer_contract_revision: digest, delivery_attempt: 1 },
      endpoint_fence: { engineer_id: 'engineer:capability.verification.evals-checks', binding_id: '11111111-1111-4111-8111-111111111111', binding_generation: 1, engineer_contract_revision: digest, adapter_kind: 'herdr-cli-agent', host_id: 'local', endpoint_id: 'fixture' },
    }));
    expect(executeHerdrCliAgentAction(action, () => endpoint).outcome).toBe('accepted');
    await until(() => existsSync(received) && readFileSync(received, 'utf8').includes(action.control_ref));
    const multiline = 'first line\n第二行 $literal `text`';
    expect(call(['agent', 'prompt', endpoint.agentName, multiline]).type).toBe('agent_prompted');
    await until(() => readFileSync(received, 'utf8').includes(multiline));
    expect(readFileSync(received, 'utf8')).toContain('\x1b[200~' + multiline + '\x1b[201~');
    expect(readFileSync(received, 'utf8').split(action.control_ref)).toHaveLength(2);
    // Every CLI invocation uses a new connection; reads/reconnects never submit again.
    call(['agent', 'get', endpoint.agentName]); call(['agent', 'get', endpoint.agentName]);
    expect(herdrCommand(endpoint, ['pane', 'report-agent', pane, '--source', 'fixture', '--agent', 'codex', '--state', 'blocked', '--seq', '2']).status).toBe(0);
    const before = readFileSync(received, 'utf8');
    expect(executeHerdrCliAgentAction(action, () => endpoint).outcome).toBe('unavailable');
    expect(readFileSync(received, 'utf8')).toBe(before);
    expect(herdrCommand(endpoint, ['pane', 'close', pane]).status).toBe(0);
    expect(executeHerdrCliAgentAction(action, () => endpoint).outcome).toBe('unavailable');
  } finally {
    herdrCommand(endpoint, ['server', 'stop']);
    await new Promise<void>(resolve => server.exitCode !== null ? resolve() : server.once('exit', () => resolve()));
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);
