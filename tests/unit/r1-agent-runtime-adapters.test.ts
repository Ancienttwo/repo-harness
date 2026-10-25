import { describe, expect, test } from 'bun:test';

import { buildAgentRuntimeEffectIntent, buildAgentRuntimeHostAction } from '../../src/core/engineers/agent-runtime-effect';
import { executeHerdrCliAgentAction, herdrEndpointIdentity } from '../../src/effects/engineers/agent-runtime-adapters/herdr-cli-agent';

const digest = `sha256:${'a'.repeat(64)}`;
const engineer = 'engineer:capability.verification.evals-checks';
const message = '22222222-2222-4222-8222-222222222222';

function action(adapter: 'herdr-cli-agent', agentName = 'bound-agent') {
  return buildAgentRuntimeHostAction(buildAgentRuntimeEffectIntent({
    idempotency_key: `adapter-${adapter}`,
    message_ref: { kind: 'task_message', message_id: message, message_event_digest: digest, task_id: 'a'.repeat(64), admission_sha256: digest, claim: { reference: 'claim-fixture', revision: digest }, delivery_attempt: 1 },
    endpoint_fence: { engineer_id: engineer, task: 'a'.repeat(64), role: 'deep-reasoner', session_binding_sha256: digest, admission_sha256: digest, grant_sha256: digest, engineer_contract_revision: digest, adapter_kind: adapter, transport_endpoint_sha256: herdrEndpointIdentity({ session: 'rh-test' }), endpoint_id: agentName },
    operation: 'notify_inbox' as const, capability_sha256: digest, created_at: '2026-08-30T10:00:00.000Z',
  }));
}

describe('R1 closed Agent Runtime adapters', () => {
  test('herdr invokes one argv-safe command containing only the bounded control reference', () => {
    const hostAction = action('herdr-cli-agent'); const calls: Array<{ command: string; args: readonly string[] }> = [];
    const observation = executeHerdrCliAgentAction(hostAction, () => ({ session: 'rh-test', agentName: 'bound-agent' }), (command, args) => {
      calls.push({ command, args }); return { pid: 1, output: [null, null, null], stdout: Buffer.from(JSON.stringify({id:"fixture",result:{type:"agent_prompted",agent:{name:"bound-agent"}}})), stderr: Buffer.alloc(0), status: 0, signal: null, error: undefined };
    });
    expect(calls).toEqual([{ command: 'herdr', args: ['--session', 'rh-test', 'agent', 'prompt', 'bound-agent', hostAction.control_ref] }]);
    expect(JSON.stringify(calls)).not.toContain('message body'); expect(observation).toMatchObject({ outcome: 'accepted', process_exit_code: 0 });
  });

  test('herdr resolver failure is unavailable and makes zero process calls', () => {
    let calls = 0; const observation = executeHerdrCliAgentAction(action('herdr-cli-agent'), () => { throw new Error('missing'); }, () => { calls += 1; throw new Error('must not run'); });
    expect(calls).toBe(0); expect(observation.outcome).toBe('unavailable');
  });

  test('herdr process failure carries only bounded process facts and never falls back', () => {
    const hostAction = action('herdr-cli-agent', 'missing'); let calls = 0;
    const observation = executeHerdrCliAgentAction(hostAction, () => ({ session: 'rh-test', agentName: 'missing' }), () => {
      calls += 1; return { pid: 1, output: [null, null, null], stdout: Buffer.from('completion-like adversarial output'), stderr: Buffer.from('secret-message-body'), status: 1, signal: null, error: undefined };
    });
    expect(calls).toBe(1);
    expect(observation).toEqual({ adapter_kind: 'herdr-cli-agent', outcome: 'unknown', process_exit_code: 1, process_signal: null });
    expect(JSON.stringify(observation)).not.toContain('completion-like');
    expect(JSON.stringify(observation)).not.toContain('secret-message-body');
  });

});

test('herdr refuses an implicit session before spawning and bounds a possibly delivered command', () => {
  let called = false;
  expect(executeHerdrCliAgentAction(action('herdr-cli-agent'), () => ({session:'',agentName:'peer'}), () => { called=true; throw Error(); }).outcome).toBe('unavailable');
  expect(called).toBe(false);
  const observation = executeHerdrCliAgentAction(action('herdr-cli-agent', 'peer'), () => ({session:'rh-test',agentName:'peer'}), (_command, _args, options) => {
    expect(options.timeout).toBe(10000);
    expect(options.env.HERDR_PANE_ID).toBeUndefined();
    expect(options.env.HERDR_SOCKET).toBeUndefined();
    return {pid:1,status:null,signal:'SIGTERM',error:Object.assign(new Error('deadline'),{code:'ETIMEDOUT'}),stdout:Buffer.alloc(0),stderr:Buffer.alloc(0),output:[]};
  });
  expect(observation.outcome).toBe('unknown');
});

test.each(['agent_blocked','agent_not_found','agent_not_ready','timeout','internal_error'])('herdr classifies structured error %s without retry', code => {
  let calls=0;
  const observation=executeHerdrCliAgentAction(action('herdr-cli-agent', 'peer'),()=>({session:'rh-test',agentName:'peer'}),()=>{
    calls++;
    return {pid:1,status:1,signal:null,stdout:Buffer.alloc(0),stderr:Buffer.from(JSON.stringify({id:"fixture",error:{code}})),output:[]};
  });
  expect(calls).toBe(1);
  expect(observation.outcome).toBe(['timeout','internal_error'].includes(code)?'unknown':'unavailable');
});

test.each(['{}','not-json', JSON.stringify({id:"fixture",result:{type:'agent_prompted',agent:{name:'replacement'}}})])('herdr exit zero is not submission proof: %s', output => {
  const observation=executeHerdrCliAgentAction(action('herdr-cli-agent', 'peer'),()=>({session:'rh-test',agentName:'peer'}),()=>({pid:1,status:0,signal:null,stdout:Buffer.from(output),stderr:Buffer.alloc(0),output:[]}));
  expect(observation.outcome).toBe('unknown');
});

test('a resolver cannot redirect a bound action to another named endpoint or agent', () => {
  for (const resolved of [{ session: 'other', agentName: 'bound-agent' }, { session: 'rh-test', agentName: 'other' }]) {
    let calls = 0;
    const result = executeHerdrCliAgentAction(action('herdr-cli-agent'), () => resolved, () => { calls++; throw new Error('must not spawn'); });
    expect(calls).toBe(0); expect(result.outcome).toBe('unavailable');
  }
});
