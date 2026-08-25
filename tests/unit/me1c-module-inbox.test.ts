import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

import { buildModuleMessageEvent, type ModuleMessageEventInput } from '../../src/core/engineers/module-message';
import { validateEngineerPrincipal, type EngineerPrincipalV1 } from '../../src/core/engineers/principal-claim';
import { bindEngineer, readEngineerBindingStatus } from '../../src/effects/engineers/binding-store';
import {
  ModuleInboxError,
  acknowledgeModuleMessage,
  moduleInboxEngineerDirectory,
  receiveModuleInbox,
  sendModuleMessage,
  type ModuleMessageTransport,
} from '../../src/effects/engineers/module-inbox';
import { loadEngineerProfile } from '../../src/effects/engineers/profile-store';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';

const sourceRoot = process.cwd();
const roots: string[] = [];
const engineerId = 'engineer:capability.verification.evals-checks';
const capabilityId = 'capability.verification.evals-checks';
const bindingOne = '11111111-1111-4111-8111-111111111111';
const bindingTwo = '22222222-2222-4222-8222-222222222222';
const messageOne = '123e4567-e89b-42d3-a456-426614174000';
const messageTwo = '223e4567-e89b-42d3-a456-426614174000';

function fixture(): string {
  const repoRoot = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-me1c-inbox-')));
  roots.push(repoRoot);
  execFileSync('git', ['init', '-q'], { cwd: repoRoot });
  execFileSync('git', ['config', 'user.email', 'tests@example.invalid'], { cwd: repoRoot });
  execFileSync('git', ['config', 'user.name', 'Tests'], { cwd: repoRoot });
  mkdirSync(join(repoRoot, '.archcontext/model'), { recursive: true });
  mkdirSync(join(repoRoot, 'agents'), { recursive: true });
  cpSync(join(sourceRoot, '.archcontext/model/nodes'), join(repoRoot, '.archcontext/model/nodes'), { recursive: true });
  cpSync(join(sourceRoot, 'agents/engineers'), join(repoRoot, 'agents/engineers'), { recursive: true });
  writeFileSync(join(repoRoot, 'README.md'), 'fixture\n');
  execFileSync('git', ['add', '.'], { cwd: repoRoot });
  execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: repoRoot });
  return repoRoot;
}

function bind(repoRoot: string, id: string, expected?: ReturnType<typeof readEngineerBindingStatus>['current']) {
  const profile = loadEngineerProfile(repoRoot, engineerId);
  return bindEngineer(repoRoot, {
    engineer_id: engineerId,
    idempotency_key: `bind-${id}`,
    provider: 'codex',
    provider_thread_id: `thread-${id}`,
    host_id: 'local',
    engineer_contract_revision: profile.engineer_contract_revision,
    expected_current_digest: expected?.current_digest ?? null,
    expected_binding_generation: expected?.binding_generation ?? 0,
    expected_binding_id: expected?.current_binding_id ?? null,
    expected_engineer_contract_revision: profile.engineer_contract_revision,
    binding_id: () => id,
    now: () => expected ? '2026-08-25T07:10:00.000Z' : '2026-08-25T07:00:00.000Z',
  });
}

function principal(repoRoot: string): EngineerPrincipalV1 {
  const profile = loadEngineerProfile(repoRoot, engineerId);
  const binding = readEngineerBindingStatus(repoRoot, engineerId, profile.engineer_contract_revision).binding!;
  return validateEngineerPrincipal({
    protocol: 1,
    kind: 'repo-harness-engineer-principal',
    repository_id: repoHarnessRepoIdFor(repoRoot),
    engineer_id: engineerId,
    binding_id: binding.binding_id,
    binding_generation: binding.binding_generation,
    engineer_contract_revision: binding.engineer_contract_revision,
    carrier: 'mcp_oauth',
    auth_subject: '33333333-3333-4333-8333-333333333333',
    provider: 'codex',
    provider_thread_id: binding.provider_thread_id,
  });
}

function message(repoRoot: string, overrides: Partial<ModuleMessageEventInput> = {}) {
  const profile = loadEngineerProfile(repoRoot, engineerId);
  const binding = readEngineerBindingStatus(repoRoot, engineerId, profile.engineer_contract_revision).binding!;
  return buildModuleMessageEvent({
    message_id: messageOne,
    capability_id: capabilityId,
    target_engineer_id: engineerId,
    scope: 'assignment',
    target_binding_id: binding.binding_id,
    target_binding_generation: binding.binding_generation,
    target_engineer_contract_revision: binding.engineer_contract_revision,
    message_type: 'work_request',
    subject_ref: null,
    resource_refs: [],
    sender: { kind: 'program_orchestrator', principal_ref: 'human:ancienttwo', binding_generation: null },
    body: 'Inspect the bounded request.',
    created_at: '2026-08-25T07:01:00.000Z',
    ...overrides,
  });
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('git-common-dir Module Engineer inbox', () => {
  test('persists event and pending receipt before transport and records transport failure without semantic fallback', () => {
    const repoRoot = fixture();
    bind(repoRoot, bindingOne);
    const calls: unknown[] = [];
    const transport: ModuleMessageTransport = {
      deliver(input) {
        calls.push(input);
        throw new Error('provider unavailable');
      },
    };
    const result = sendModuleMessage({ repo_root: repoRoot, event: message(repoRoot), transport, now: () => '2026-08-25T07:02:00.000Z' });
    expect(calls).toHaveLength(1);
    expect(result).toMatchObject({
      created: true,
      receipt: { delivery_state: 'pending', attempt: 1 },
      observation: { outcome: 'transport_error', attempt: 1 },
    });
    expect((calls[0] as { payload: string }).payload).toContain(result.event.event_digest);
    expect((calls[0] as { payload: string }).payload).not.toContain('provider_thread_id');
  });

  test('a persistence fault prevents any transport effect', () => {
    const repoRoot = fixture();
    bind(repoRoot, bindingOne);
    const inbox = moduleInboxEngineerDirectory(repoRoot, engineerId);
    const root = dirname(dirname(inbox));
    mkdirSync(dirname(root), { recursive: true });
    writeFileSync(root, 'blocks-directory\n');
    let calls = 0;
    expect(() => sendModuleMessage({
      repo_root: repoRoot,
      event: message(repoRoot),
      transport: { deliver: () => { calls += 1; throw new Error('must not run'); } },
    })).toThrow(ModuleInboxError);
    expect(calls).toBe(0);
  });

  test('rotation supersedes assignment scope while module scope survives and is delivered to the new Binding', () => {
    const repoRoot = fixture();
    const first = bind(repoRoot, bindingOne);
    sendModuleMessage({ repo_root: repoRoot, event: message(repoRoot) });
    sendModuleMessage({
      repo_root: repoRoot,
      event: message(repoRoot, {
        message_id: messageTwo,
        scope: 'module',
        target_binding_id: null,
        target_binding_generation: null,
        target_engineer_contract_revision: null,
        created_at: '2026-08-25T07:02:00.000Z',
      }),
    });
    bind(repoRoot, bindingTwo, first);
    const received = receiveModuleInbox({
      repo_root: repoRoot,
      principal: principal(repoRoot),
      delivered_at: '2026-08-25T07:11:00.000Z',
    });
    expect(received.superseded_count).toBe(1);
    expect(received.entries.find((entry) => entry.event.message_id === messageOne)?.receipt.delivery_state).toBe('superseded');
    expect(received.entries.find((entry) => entry.event.message_id === messageTwo)?.receipt).toMatchObject({
      delivery_state: 'delivered',
      target_binding_generation: null,
      attempt: 1,
    });
  });

  test('verifies typed resource bytes before acknowledgement and leaves the receipt unacknowledged on mismatch', () => {
    const repoRoot = fixture();
    bind(repoRoot, bindingOne);
    const locator = 'tasks/contracts/work.contract.md';
    const absolute = join(repoRoot, locator);
    mkdirSync(dirname(absolute), { recursive: true });
    const exact = Buffer.from('contract authority bytes\n');
    writeFileSync(absolute, exact);
    const digest = `sha256:${createHash('sha256').update(exact).digest('hex')}`;
    sendModuleMessage({
      repo_root: repoRoot,
      event: message(repoRoot, { resource_refs: [{ kind: 'contract', locator, sha256: digest }] }),
    });
    const current = principal(repoRoot);
    receiveModuleInbox({ repo_root: repoRoot, principal: current, delivered_at: '2026-08-25T07:03:00.000Z' });
    writeFileSync(absolute, 'corrupt\n');
    expect(() => acknowledgeModuleMessage({ repo_root: repoRoot, principal: current, message_id: messageOne }))
      .toThrow('resource digest mismatch');
    writeFileSync(absolute, exact);
    expect(acknowledgeModuleMessage({ repo_root: repoRoot, principal: current, message_id: messageOne }).receipt)
      .toMatchObject({ delivery_state: 'acknowledged', acknowledged_by_binding_generation: 1 });
  });
});
