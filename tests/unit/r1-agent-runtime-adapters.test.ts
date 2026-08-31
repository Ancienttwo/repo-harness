import { describe, expect, test } from 'bun:test';

import { buildAgentRuntimeEffectIntent, buildAgentRuntimeHostAction } from '../../src/core/engineers/agent-runtime-effect';
import { executeCodexAppThreadAction } from '../../src/effects/engineers/agent-runtime-adapters/codex-app-thread';
import { executeTmuxCliAgentAction } from '../../src/effects/engineers/agent-runtime-adapters/tmux-cli-agent';

const digest = `sha256:${'a'.repeat(64)}`;
const engineer = 'engineer:capability.verification.evals-checks';
const binding = '11111111-1111-4111-8111-111111111111';
const message = '22222222-2222-4222-8222-222222222222';

function action(adapter: 'codex-app-thread' | 'tmux-cli-agent') {
  return buildAgentRuntimeHostAction(buildAgentRuntimeEffectIntent({
    idempotency_key: `adapter-${adapter}`,
    message_ref: { kind: 'module_message', message_id: message, message_event_digest: digest, engineer_id: engineer, binding_id: binding, binding_generation: 1, engineer_contract_revision: digest, delivery_attempt: 1 },
    endpoint_fence: { engineer_id: engineer, binding_id: binding, binding_generation: 1, engineer_contract_revision: digest, adapter_kind: adapter, host_id: 'local', endpoint_id: 'opaque-endpoint' },
    operation: 'notify_inbox', capability_sha256: digest, created_at: '2026-08-30T10:00:00.000Z',
  }));
}

describe('R1 closed Agent Runtime adapters', () => {
  test('tmux invokes one argv-safe command containing only the bounded control reference', () => {
    const hostAction = action('tmux-cli-agent'); const calls: Array<{ command: string; args: readonly string[] }> = [];
    const observation = executeTmuxCliAgentAction(hostAction, ({ endpoint_id }) => `%resolved-${endpoint_id}`, (command, args) => {
      calls.push({ command, args }); return { pid: 1, output: [null, null, null], stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), status: 0, signal: null, error: undefined };
    });
    expect(calls).toEqual([{ command: 'tmux', args: ['send-keys', '-t', '%resolved-opaque-endpoint', '--', hostAction.control_ref, 'Enter'] }]);
    expect(JSON.stringify(calls)).not.toContain('message body'); expect(observation).toMatchObject({ outcome: 'accepted', process_exit_code: 0 });
  });

  test('tmux resolver failure is unavailable and makes zero process calls', () => {
    let calls = 0; const observation = executeTmuxCliAgentAction(action('tmux-cli-agent'), () => { throw new Error('missing'); }, () => { calls += 1; throw new Error('must not run'); });
    expect(calls).toBe(0); expect(observation.outcome).toBe('unavailable');
  });

  test('tmux process failure carries only bounded process facts and never falls back', () => {
    const hostAction = action('tmux-cli-agent'); let calls = 0;
    const observation = executeTmuxCliAgentAction(hostAction, () => '%missing', () => {
      calls += 1; return { pid: 1, output: [null, null, null], stdout: Buffer.from('completion-like adversarial output'), stderr: Buffer.from('secret-message-body'), status: 1, signal: null, error: undefined };
    });
    expect(calls).toBe(1);
    expect(observation).toEqual({ adapter_kind: 'tmux-cli-agent', outcome: 'failed', process_exit_code: 1, process_signal: null });
    expect(JSON.stringify(observation)).not.toContain('completion-like');
    expect(JSON.stringify(observation)).not.toContain('secret-message-body');
  });

  test('Codex receives the same control reference and no message body', () => {
    const hostAction = action('codex-app-thread'); let input: unknown;
    const observation = executeCodexAppThreadAction(hostAction, (value) => { input = value; return { accepted: true }; });
    expect(input).toEqual({ host_id: 'local', thread_id: 'opaque-endpoint', control_ref: hostAction.control_ref }); expect(observation.outcome).toBe('accepted');
  });
});
