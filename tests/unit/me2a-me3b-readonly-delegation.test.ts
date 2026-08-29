import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  CODEX_READ_ONLY_ARGV_TEMPLATE,
  CODEX_READ_ONLY_PROOF_SURFACE,
  buildDelegationAdmissionReceipt,
  buildDelegationEnvelope,
  buildDelegationExecutionPacket,
  canonicalDelegationEnvelopeBytes,
  canonicalDelegationExecutionPacketBytes,
  validateDelegationEnvelope,
} from '../../src/core/engineers/delegation';
import { canonicalMessageDigest } from '../../src/core/messages/mechanics';
import {
  DelegatedRunStoreError,
  admitReadOnlyDelegation,
  collectDelegatedRunResult,
  delegatedRunProtectedScopeSha,
  dispatchDelegatedRun,
  readCodexProcessReceipt,
  readDelegatedRunEvidenceBlob,
  readLogicalRoleInstructions,
  loadLogicalReadOnlyRoleProfile,
  prepareDelegatedRun,
  recordCodexReadOnlyCapability,
} from '../../src/effects/engineers/delegated-run-store';

const sourceRoot = process.cwd();
const roots: string[] = [];
const DIGEST = `sha256:${'a'.repeat(64)}`;
const TASK = 'b'.repeat(64);
const TASK_REVISION = 'c'.repeat(64);
const delegationId = '11111111-1111-4111-8111-111111111111';
const claimId = '22222222-2222-4222-8222-222222222222';
const bindingId = '33333333-3333-4333-8333-333333333333';

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-me2a-me3b-'));
  roots.push(root);
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'tests@example.invalid'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Tests'], { cwd: root });
  cpSync(join(sourceRoot, '.codex'), join(root, '.codex'), { recursive: true });
  writeFileSync(join(root, 'protected.txt'), 'before\n');
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: root });
  return realpathSync(root);
}

const SHELL_INJECTED_ENV_KEYS = ['PWD', 'SHLVL', '_', 'OLDPWD', 'IFS'];

function childEnvDigest(path: string): string {
  return canonicalMessageDigest({ domain: 'repo-harness-delegated-run-child-env.v1', env: { HOME: process.env.HOME, PATH: path } });
}

function dumpedChildEnvKeys(root: string, file: string): Set<string> {
  return new Set(readFileSync(join(root, file), 'utf8').split('\n').filter(Boolean).map((line) => line.slice(0, line.indexOf('='))));
}

function admitted(root: string, options: { parentStale?: boolean; removeProfileBeforeAdmit?: boolean; canary?: 'valid' | 'write-success' | 'no-denial' | 'suffix-denial' | 'extra-denial' } = {}) {
  const profile = loadLogicalReadOnlyRoleProfile(root, 'explorer');
  const protectedPaths = ['common:.repo-harness-read-only-canary-common', 'worktree:.repo-harness-read-only-canary-worktree'];
  const fakeBin = join(root, 'fake-bin');
  mkdirSync(fakeBin, { recursive: true });
  const fakeCodex = join(fakeBin, 'codex');
  const suffix = options.canary === 'suffix-denial' ? '-other' : '';
  const denials = options.canary === 'no-denial' ? '' : [
    `printf '%s\\n' "touch: \${worktree}${suffix}: Operation not permitted" >&2`,
    `printf '%s\\n' "touch: \${common}${suffix}: Operation not permitted" >&2`,
    options.canary === 'extra-denial' ? 'printf \'%s\\n\' "touch: $PWD/extra: Operation not permitted" >&2' : '',
  ].join('\n');
  const writeSuccess = options.canary === 'write-success'
    ? 'printf "violated\\n" > "$worktree"\nexit 0'
    : `${denials}\nexit 1`;
  writeFileSync(fakeCodex, `#!/bin/sh
if [ "$1" = "--version" ]; then printf "codex-cli 0.149.0\\n"; exit 0; fi
if [ "$1" = "sandbox" ]; then
  /usr/bin/env > "$PWD/.fake-canary-env"
  previous=""
  last=""
  for argument in "$@"; do previous="$last"; last="$argument"; done
  worktree="$previous"
  common="$last"
  ${writeSuccess}
fi
if [ "$1" = "exec" ]; then
  printf 'call\\n' >> "$PWD/.fake-dispatch-calls"
  /usr/bin/env > "$PWD/.fake-dispatch-env"
  mode=""
  if [ -f "$PWD/.fake-dispatch-mode" ]; then mode=$(/bin/cat "$PWD/.fake-dispatch-mode"); fi
  if [ "$mode" = "tamper" ]; then printf 'tampered\\n' > "$PWD/.repo-harness-read-only-canary-worktree"; fi
  if [ "$mode" = "fail" ]; then exit 7; fi
  printf '%s\\n' '{"untrusted":true}'
  exit 0
fi
exit 64
`);
  chmodSync(fakeCodex, 0o700);
  const capabilityInput = join(root, '.capability-input.json');
  writeFileSync(capabilityInput, `${JSON.stringify({ logical_role: profile.logical_role, observed_at: '2026-08-26T00:00:00Z' })}\n`);
  const capability = JSON.parse(execFileSync(process.execPath, [
    join(sourceRoot, 'src/cli/index.ts'),
    'delegation',
    'capability',
    '--input',
    '.capability-input.json',
    '--format',
    'json',
  ], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH ?? ''}` },
  })) as ReturnType<typeof recordCodexReadOnlyCapability>;
  const packet = buildDelegationExecutionPacket({
    delegation_id: delegationId,
    logical_role: profile.logical_role,
    role_profile_sha256: profile.role_profile_sha256,
    model: profile.model,
    role_instructions: readLogicalRoleInstructions(root, profile),
    goal: 'Read the protected file and return untrusted evidence.',
    allowed_read_paths: ['protected.txt'],
    max_turns: 1,
    max_depth: 0,
    return_contract: 'WorkerResultV1',
  });
  const envelope = buildDelegationEnvelope({
    delegation_id: delegationId,
    parent: { task_id: TASK, task_revision: TASK_REVISION, claim_id: claimId, lease_generation: 1, work_envelope_sha256: DIGEST },
    engineer: { engineer_id: 'engineer:capability.verification.evals-checks', binding_id: bindingId, binding_generation: 1, claim_actor_receipt_sha256: `sha256:${'f'.repeat(64)}` },
    logical_role: profile.logical_role,
    role_profile_sha256: profile.role_profile_sha256,
    runtime_capability_sha256: capability.capability_sha256,
    execution_packet_sha256: packet.packet_sha256,
    mode: 'read_only',
    goal: packet.goal,
    allowed_read_paths: packet.allowed_read_paths,
    budget: { max_turns: 1, max_depth: 0 },
    return_contract: 'WorkerResultV1',
  });
  const live = {
    receipt_sha256: options.parentStale ? DIGEST : envelope.engineer.claim_actor_receipt_sha256,
    task_id: TASK,
    task_revision: TASK_REVISION,
    claim_id: claimId,
    lease_generation: 1,
    work_envelope_sha256: DIGEST,
    engineer_id: envelope.engineer.engineer_id,
    binding_id: bindingId,
    binding_generation: 1,
  };
  if (options.removeProfileBeforeAdmit) rmSync(join(root, '.codex/agents/explorer.toml'));
  const result = admitReadOnlyDelegation({
    repo_root: root,
    envelope,
    role_profile: profile,
    capability,
    execution_packet: packet,
    work_envelope: {} as never,
    claim_actor_receipt: {} as never,
    decided_at: '2026-08-26T00:00:01Z',
    validate_parent: () => live as never,
  });
  return { profile, capability, packet, envelope, receipt: result.receipt, protectedPaths };
}

function dispatchCalls(root: string): number {
  const path = join(root, '.fake-dispatch-calls');
  return existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean).length : 0;
}

function prepare(root: string, admission: ReturnType<typeof admitted>) {
  return prepareDelegatedRun({
    repo_root: root,
    idempotency_key: 'run-once',
    delegation_id: delegationId,
    admission_receipt_sha256: admission.receipt.admission_receipt_sha256,
    context_packet_sha256: admission.packet.packet_sha256,
    round_index: 0,
    observed_at: '2026-08-26T00:00:02Z',
  });
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('ME-2A read-only admission and conditional ME-3B adapter', () => {
  test('uses closed canonical schema fields and rejects a stale derived digest', () => {
    const root = fixture();
    const built = admitted(root).envelope;
    expect(validateDelegationEnvelope(JSON.parse(canonicalDelegationEnvelopeBytes(built)))).toEqual(built);
    expect(() => validateDelegationEnvelope({ ...built, goal: 'altered' })).toThrow('envelope_sha256 is stale');
  });

  test('rejects stale parent evidence before any immutable run intent exists', () => {
    const root = fixture();
    const result = admitted(root, { parentStale: true });
    expect(result.receipt).toMatchObject({ decision: 'rejected', rejection_reason: 'parent_stale' });
    expect(() => prepare(root, result)).toThrow(DelegatedRunStoreError);
  });

  test('persists immutable intent, claims once, invokes one exact read-only action, and keeps WorkerResult untrusted', () => {
    const root = fixture();
    const admission = admitted(root);
    const prepared = prepare(root, admission);
    const dispatched = dispatchDelegatedRun({
      repo_root: root,
      dispatch_id: prepared.intent.dispatch_id,
      observed_at: '2026-08-26T00:00:03Z',
      protected_paths: admission.protectedPaths,
    });
    expect(dispatchCalls(root)).toBe(1);
    expect(dispatched.current).toMatchObject({ state: 'completed', failure_class: 'none' });
    expect(readFileSync(join(root, 'protected.txt'), 'utf8')).toBe('before\n');
    const duplicate = dispatchDelegatedRun({
      repo_root: root,
      dispatch_id: prepared.intent.dispatch_id,
      observed_at: '2026-08-26T00:00:04Z',
      protected_paths: admission.protectedPaths,
    });
    expect(duplicate.current.state).toBe('completed');
    expect(dispatchCalls(root)).toBe(1);
    const collected = collectDelegatedRunResult({
      repo_root: root,
      dispatch_id: prepared.intent.dispatch_id,
      untrusted_claims: ['completed according to worker prose'],
      contribution_refs: [],
    });
    expect(collected.result).toMatchObject({ logical_role: 'explorer', untrusted_claims: ['completed according to worker prose'] });
    expect(collected.result).not.toHaveProperty('task_id');
    const processReceipt = readCodexProcessReceipt(root, dispatched.current.process_receipt_sha256!);
    expect(collected.result?.evidence_refs).toEqual([
      { ref: processReceipt.stdout_ref, sha256: processReceipt.stdout_sha256 },
      { ref: processReceipt.stderr_ref, sha256: processReceipt.stderr_sha256 },
      { ref: processReceipt.error_ref, sha256: processReceipt.error_sha256 },
    ]);
    expect(processReceipt.executable_path).toBe(admission.capability.executable_path);
    expect(processReceipt.argv.slice(0, 11)).toEqual(['exec', '--sandbox', 'read-only', '--ephemeral', '--ignore-user-config', '--strict-config', '--json', '--model', admission.profile.model, '-c', `developer_instructions=${JSON.stringify(readLogicalRoleInstructions(root, admission.profile))}`]);
    // The dispatched argv is the frozen capability-receipt template with its
    // three placeholders substituted, so admission compares what dispatch runs.
    const substitutions: Readonly<Record<string, string>> = {
      '{model}': admission.capability.model,
      '{developer_instructions_config}': `developer_instructions=${JSON.stringify(readLogicalRoleInstructions(root, admission.profile))}`,
      '{execution_packet}': canonicalDelegationExecutionPacketBytes(admission.packet),
    };
    expect(processReceipt.argv).toEqual(CODEX_READ_ONLY_ARGV_TEMPLATE.map((part) => substitutions[part] ?? part));
    expect(readDelegatedRunEvidenceBlob(root, processReceipt.stdout_ref, processReceipt.stdout_sha256).toString('utf8')).toBe('{"untrusted":true}\n');
  });

  test('lost ACK after persisted launch claim reconciles without a second action', () => {
    const root = fixture();
    const admission = admitted(root);
    const prepared = prepare(root, admission);
    const first = dispatchDelegatedRun({
      repo_root: root,
      dispatch_id: prepared.intent.dispatch_id,
      observed_at: '2026-08-26T00:00:03Z',
      protected_paths: admission.protectedPaths,
      crash_hook: (boundary) => { if (boundary === 'after_host_action_before_receipt') throw new Error('lost acknowledgement after host action'); },
    });
    expect(first.current.state).toBe('reconciliation_required');
    const retry = dispatchDelegatedRun({
      repo_root: root,
      dispatch_id: prepared.intent.dispatch_id,
      observed_at: '2026-08-26T00:00:04Z',
      protected_paths: admission.protectedPaths,
    });
    expect(retry.current.state).toBe('reconciliation_required');
    expect(dispatchCalls(root)).toBe(1);
  });

  test('fails result collection when the protected snapshot changed', () => {
    const root = fixture();
    const admission = admitted(root);
    const prepared = prepare(root, admission);
    writeFileSync(join(root, '.fake-dispatch-mode'), 'tamper\n');
    const dispatched = dispatchDelegatedRun({
      repo_root: root,
      dispatch_id: prepared.intent.dispatch_id,
      observed_at: '2026-08-26T00:00:03Z',
      protected_paths: admission.protectedPaths,
    });
    expect(dispatched.current).toMatchObject({ state: 'failed', failure_class: 'protected_state_changed' });
    expect(() => collectDelegatedRunResult({ repo_root: root, dispatch_id: prepared.intent.dispatch_id, untrusted_claims: [], contribution_refs: [] })).toThrow('only a completed verified run');
  });

  test('refuses a tracked Role Profile that changed after admission', () => {
    const root = fixture();
    const admission = admitted(root);
    const prepared = prepare(root, admission);
    const toml = join(root, '.codex/agents/explorer.toml');
    writeFileSync(toml, `${readFileSync(toml, 'utf8')}\n# later revision\n`);
    expect(() => dispatchDelegatedRun({
      repo_root: root,
      dispatch_id: prepared.intent.dispatch_id,
      observed_at: '2026-08-26T00:00:03Z',
      protected_paths: admission.protectedPaths,
    })).toThrow('tracked logical Role Profile changed after admission');
  });

  test('derives capability proof from a frozen canary and rejects forged or incomplete proof', () => {
    const root = fixture();
    expect(() => admitted(root, { canary: 'no-denial' })).toThrow('denial set');
    expect(() => admitted(root, { canary: 'suffix-denial' })).toThrow('denial set');
    expect(() => admitted(root, { canary: 'extra-denial' })).toThrow('denial set');
    expect(() => admitted(root, { canary: 'write-success' })).toThrow('protected snapshot');
    expect(() => recordCodexReadOnlyCapability(root, { logical_role: 'explorer', observed_at: '2026-08-26T00:00:00Z', executable_path: '/tmp/forged' } as never)).toThrow('capability request fields are invalid');
    expect(existsSync(join(root, '.git/repo-harness/delegated-runs/v1/capabilities'))).toBe(false);
    expect(readdirSync(join(root, '.git/repo-harness/delegated-runs/v1/process-receipts')).length).toBeGreaterThan(0);
  });

  test('fails closed after a persisted launch claim before observation and does not invoke again', () => {
    const root = fixture();
    const admission = admitted(root);
    const prepared = prepare(root, admission);
    expect(() => dispatchDelegatedRun({
      repo_root: root, dispatch_id: prepared.intent.dispatch_id, observed_at: '2026-08-26T00:00:03Z', protected_paths: admission.protectedPaths,
      crash_hook: (boundary) => { if (boundary === 'after_launch_claim_persisted') throw new Error('simulated process crash'); },
    })).toThrow('simulated process crash');
    const retry = dispatchDelegatedRun({
      repo_root: root, dispatch_id: prepared.intent.dispatch_id, observed_at: '2026-08-26T00:00:04Z', protected_paths: admission.protectedPaths,
    });
    expect(retry.current.state).toBe('reconciliation_required');
    expect(dispatchCalls(root)).toBe(0);
  });

  test('hands both the canary and the dispatch child an exact minimal environment bound into the receipts', () => {
    const root = fixture();
    const canaryPath = `${join(root, 'fake-bin')}:${process.env.PATH ?? ''}`;
    const admission = admitted(root);
    expect(admission.capability.env_sha256).toBe(childEnvDigest(canaryPath));
    const canaryReceipt = readCodexProcessReceipt(root, admission.capability.canary_process_receipt_sha256);
    expect(canaryReceipt.env_sha256).toBe(admission.capability.env_sha256);

    const prepared = prepare(root, admission);
    const dispatched = dispatchDelegatedRun({
      repo_root: root,
      dispatch_id: prepared.intent.dispatch_id,
      observed_at: '2026-08-26T00:00:03Z',
      protected_paths: admission.protectedPaths,
    });
    const dispatchReceipt = readCodexProcessReceipt(root, dispatched.current.process_receipt_sha256!);
    expect(dispatchReceipt.env_sha256).toBe(childEnvDigest(process.env.PATH ?? ''));

    for (const file of ['.fake-canary-env', '.fake-dispatch-env']) {
      const observed = dumpedChildEnvKeys(root, file);
      expect(observed.has('PATH')).toBe(true);
      expect(observed.has('HOME')).toBe(true);
      const inherited = Object.keys(process.env).filter((key) => key !== 'PATH' && key !== 'HOME' && !SHELL_INJECTED_ENV_KEYS.includes(key) && observed.has(key));
      expect(inherited).toEqual([]);
    }
  });

  test('records that the read-only proof is extrapolated from the sandbox subcommand to the exec subcommand', () => {
    const root = fixture();
    const admission = admitted(root);
    expect(admission.capability.proof_surface).toBe(CODEX_READ_ONLY_PROOF_SURFACE);
    expect(readCodexProcessReceipt(root, admission.capability.canary_process_receipt_sha256).argv[0]).toBe('sandbox');
    expect(admission.capability.argv_template[0]).toBe('exec');
  });

  test('reports an absent tracked Role Profile as typed unavailability without a Host absolute path', () => {
    const root = fixture();
    let caught: unknown;
    try { loadLogicalReadOnlyRoleProfile(root, 'nosuchrole'); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(DelegatedRunStoreError);
    expect((caught as DelegatedRunStoreError).code).toBe('delegated_run_profile_unavailable');
    expect((caught as Error).message).toContain('.codex/agents/nosuchrole.toml');
    expect((caught as Error).message).not.toContain(root);
    expect(admitted(root, { removeProfileBeforeAdmit: true }).receipt).toMatchObject({ decision: 'rejected', rejection_reason: 'role_profile_unavailable' });
  });

  test('refuses admission rejection reasons that no admission path can produce', () => {
    for (const reason of ['mode_unsupported', 'budget_invalid', 'sandbox_scope_mismatch']) {
      expect(() => buildDelegationAdmissionReceipt({
        delegation_id: delegationId, envelope_sha256: DIGEST, decision: 'rejected', rejection_reason: reason as never,
        admitted_role_profile_sha256: null, admitted_mode: null, admitted_sandbox_policy_sha256: null,
        expected_runtime_observation_sha256: null, decided_at: '2026-08-26T00:00:01Z',
      })).toThrow('rejection_reason is invalid');
    }
  });

  test('requires one turn and explicit worktree plus common regular-or-absent protected paths', () => {
    const profile = loadLogicalReadOnlyRoleProfile(fixture(), 'explorer');
    expect(() => buildDelegationExecutionPacket({ delegation_id: delegationId, logical_role: profile.logical_role, role_profile_sha256: profile.role_profile_sha256, model: profile.model, role_instructions: 'SOP', goal: 'bounded', allowed_read_paths: ['x'], max_turns: 2, max_depth: 0, return_contract: 'WorkerResultV1' })).toThrow('budget');
    expect(() => delegatedRunProtectedScopeSha([])).toThrow('worktree and common');
    expect(() => delegatedRunProtectedScopeSha(['worktree:file'])).toThrow('worktree and common');
    expect(() => delegatedRunProtectedScopeSha(['common:file'])).toThrow('worktree and common');
  });
});
