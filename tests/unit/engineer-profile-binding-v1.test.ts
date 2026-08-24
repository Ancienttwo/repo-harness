import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  ENGINEER_BINDING_KIND,
  ENGINEER_PROFILE_KIND,
  ENGINEER_PROFILE_PROTOCOL,
  buildEngineerBindingCurrent,
  buildEngineerBindingEvent,
  canonicalEngineerBindingCurrentBytes,
  canonicalModuleEngineerProfileBytes,
  deriveEngineerTransitionId,
  engineerContractRevision,
  engineerCurrentPayloadSha256,
  engineerOperationFingerprint,
  engineerSha256,
  validateEngineerBinding,
  validateEngineerBindingCurrent,
  validateEngineerBindingEvent,
  validateModuleEngineerProfile,
  type EngineerBindingV1,
  type EngineerTransitionRequest,
  type ModuleEngineerProfileV1,
} from '../../src/core/engineers/profile-binding';
import { listEngineerProfiles } from '../../src/effects/engineers/profile-store';
import { bindEngineer } from '../../src/effects/engineers/binding-store';

const profile: ModuleEngineerProfileV1 = {
  protocol: ENGINEER_PROFILE_PROTOCOL,
  kind: ENGINEER_PROFILE_KIND,
  engineer_id: 'engineer:capability.verification.evals-checks',
  capability_id: 'capability.verification.evals-checks',
  sop_ref: 'agents/engineers/sops/verification-evals-checks.md',
  delegation_policy: {
    allowed_roles: ['explorer', 'fast-worker', 'gatekeeper'],
    max_depth: 1,
    max_parallel_readers: 3,
    max_parallel_writers: 1,
  },
  max_active_claims: 1,
  escalation_policy: {
    cross_capability_change: 'interface_request',
    acceptance: 'independent_plane',
  },
};

const tempRoots: string[] = [];

function profileRepository(): string {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-engineer-profile-'));
  tempRoots.push(root);
  execFileSync('git', ['init', '-q'], { cwd: root });
  mkdirSync(join(root, '.archcontext/model'), { recursive: true });
  mkdirSync(join(root, 'agents'), { recursive: true });
  cpSync(join(process.cwd(), '.archcontext/model/nodes'), join(root, '.archcontext/model/nodes'), { recursive: true });
  cpSync(join(process.cwd(), 'agents/engineers'), join(root, 'agents/engineers'), { recursive: true });
  execFileSync('git', ['add', '.archcontext'], { cwd: root });
  return root;
}

afterEach(() => {
  while (tempRoots.length > 0) rmSync(tempRoots.pop()!, { recursive: true, force: true });
});

describe('ModuleEngineerProfileV1', () => {
  test('is exact-key, capability-backed, and canonical', () => {
    expect(validateModuleEngineerProfile(profile)).toEqual(profile);
    expect(canonicalModuleEngineerProfileBytes(profile)).toBe(canonicalModuleEngineerProfileBytes({ ...profile }));
    expect(() => validateModuleEngineerProfile({ ...profile, owned_paths: ['src/**'] })).toThrow('fields are invalid');
    expect(() => validateModuleEngineerProfile({ ...profile, capability_id: 'capability.workflow-engine.contract-assets' })).toThrow(
      'engineer_id must bind the exact capability_id',
    );
  });

  test('contract revision binds Profile, exact SOP bytes, and capability revision', () => {
    const capabilityA = engineerSha256('capability-a');
    const capabilityB = engineerSha256('capability-b');
    const baseline = engineerContractRevision(profile, '# SOP\n', capabilityA);
    expect(engineerContractRevision(profile, '# SOP\n', capabilityA)).toBe(baseline);
    expect(engineerContractRevision(profile, '# SOP\n\n', capabilityA)).not.toBe(baseline);
    expect(engineerContractRevision(profile, '# SOP\n', capabilityB)).not.toBe(baseline);
    expect(engineerContractRevision({ ...profile, max_active_claims: 2 }, '# SOP\n', capabilityA)).not.toBe(baseline);
    expect(engineerContractRevision(profile, '\ufeff# SOP\n', capabilityA)).not.toBe(baseline);
  });

  test('both tracked canaries resolve through the canonical ArchContext parser', () => {
    const resolved = listEngineerProfiles(process.cwd());
    expect(resolved.map((item) => item.profile.capability_id)).toEqual([
      'capability.verification.evals-checks',
      'capability.workflow-engine.contract-assets',
    ]);
    for (const item of resolved) {
      expect(item.capability.id).toBe(item.profile.capability_id.replace(/^capability\./u, '').replace('.', '-'));
      expect(item.engineer_contract_revision).toMatch(/^sha256:[0-9a-f]{64}$/u);
      expect(item.profile_canonical_bytes).not.toContain('prefixes');
      expect(item.profile_canonical_bytes).not.toContain('verification_hints');
    }
  });

  test('requires Profile and SOP Git index authority', () => {
    const root = profileRepository();
    expect(() => listEngineerProfiles(root)).toThrow('not present in the Git index');
    execFileSync('git', ['add', 'agents/engineers/profiles'], { cwd: root });
    expect(() => listEngineerProfiles(root)).toThrow('not present in the Git index');
    execFileSync('git', ['add', 'agents/engineers/sops'], { cwd: root });
    expect(listEngineerProfiles(root)).toHaveLength(2);
  });

  test('contract revision binds the full schema-valid capability node and exact UTF-8 BOM bytes', () => {
    const root = profileRepository();
    execFileSync('git', ['add', 'agents/engineers'], { cwd: root });
    const baseline = listEngineerProfiles(root).find((item) => item.profile.engineer_id === profile.engineer_id)!;
    const current = bindEngineer(root, {
      engineer_id: profile.engineer_id,
      idempotency_key: 'capability-revision-baseline',
      provider: 'codex',
      provider_thread_id: 'thread-baseline',
      host_id: 'local',
      engineer_contract_revision: baseline.engineer_contract_revision,
      expected_current_digest: null,
      expected_binding_generation: 0,
      expected_binding_id: null,
      expected_engineer_contract_revision: baseline.engineer_contract_revision,
    });

    const nodePath = join(root, '.archcontext/model/nodes/capability.verification.evals-checks.yaml');
    writeFileSync(nodePath, readFileSync(nodePath, 'utf8').replace(
      'Runs repository verification, contract gates, benchmarks, and evaluation suites.',
      'Runs repository verification, contract gates, benchmarks, evaluation suites, and exact Engineer fencing.',
    ));
    const capabilityChanged = listEngineerProfiles(root).find((item) => item.profile.engineer_id === profile.engineer_id)!;
    expect(capabilityChanged.capability_revision).not.toBe(baseline.capability_revision);
    expect(capabilityChanged.engineer_contract_revision).not.toBe(baseline.engineer_contract_revision);
    expect(() => bindEngineer(root, {
      engineer_id: profile.engineer_id,
      idempotency_key: 'capability-revision-stale',
      provider: 'codex',
      provider_thread_id: 'thread-new-contract',
      host_id: 'local',
      engineer_contract_revision: capabilityChanged.engineer_contract_revision,
      expected_current_digest: current.current_digest,
      expected_binding_generation: current.binding_generation,
      expected_binding_id: current.current_binding_id,
      expected_engineer_contract_revision: capabilityChanged.engineer_contract_revision,
    })).toThrow('expected binding current does not match authoritative current.json');

    const sopPath = join(root, profile.sop_ref);
    writeFileSync(sopPath, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), readFileSync(sopPath)]));
    const sopChanged = listEngineerProfiles(root).find((item) => item.profile.engineer_id === profile.engineer_id)!;
    expect(sopChanged.sop_bytes.startsWith('\ufeff')).toBe(true);
    expect(sopChanged.engineer_contract_revision).not.toBe(capabilityChanged.engineer_contract_revision);
  });
});

describe('Engineer binding protocol', () => {
  test('binds event payload and current digests without a cycle', () => {
    const revision = engineerSha256('contract');
    const request: EngineerTransitionRequest = {
      engineer_id: profile.engineer_id,
      idempotency_key: 'bind-1',
      transition: 'initialize',
      expected_current_digest: null,
      expected_binding_generation: 0,
      expected_binding_id: null,
      expected_engineer_contract_revision: revision,
      engineer_contract_revision: revision,
      provider: 'codex',
      provider_thread_id: 'thread-1',
      host_id: 'local',
    };
    const binding: EngineerBindingV1 = {
      protocol: ENGINEER_PROFILE_PROTOCOL,
      kind: ENGINEER_BINDING_KIND,
      binding_id: '11111111-1111-4111-8111-111111111111',
      engineer_id: profile.engineer_id,
      binding_generation: 1,
      provider: 'codex',
      provider_thread_id: 'thread-1',
      host_id: 'local',
      engineer_contract_revision: revision,
      state: 'active',
      previous_binding_id: null,
      bound_at: '2026-08-24T12:00:00.000Z',
      retired_at: null,
    };
    expect(engineerOperationFingerprint({
      ...request,
      engineer_contract_revision: engineerSha256('server-derived-contract-v2'),
    })).toBe(engineerOperationFingerprint(request));
    const payload = {
      protocol: ENGINEER_PROFILE_PROTOCOL,
      kind: 'repo-harness-engineer-binding-current' as const,
      engineer_id: profile.engineer_id,
      binding_generation: 1,
      state: 'active' as const,
      current_binding_id: binding.binding_id,
      engineer_contract_revision: revision,
    };
    const event = buildEngineerBindingEvent({
      transition_id: deriveEngineerTransitionId(profile.engineer_id, 'bind-1'),
      idempotency_key: 'bind-1',
      operation_fingerprint: engineerOperationFingerprint(request),
      engineer_id: profile.engineer_id,
      transition: 'initialize',
      expected_current_digest: null,
      expected_binding_generation: 0,
      previous_binding_id: null,
      next_binding: binding,
      next_current_payload_sha256: engineerCurrentPayloadSha256(payload),
      created_at: '2026-08-24T12:00:00.000Z',
    });
    const current = buildEngineerBindingCurrent(event);
    expect(validateEngineerBindingEvent(event)).toEqual(event);
    expect(validateEngineerBindingCurrent(current)).toEqual(current);
    expect(JSON.parse(canonicalEngineerBindingCurrentBytes(current))).toEqual(current);
    expect(() => validateEngineerBindingEvent({ ...event, event_digest: engineerSha256('stale') })).toThrow('event_digest is stale');
    expect(() => validateEngineerBindingCurrent({ ...current, extra: true })).toThrow('fields are invalid');
    expect(() => validateEngineerBinding({ ...binding, bound_at: '2026-02-30T00:00:00Z' })).toThrow('bound_at is invalid');
    expect(() => validateEngineerBinding({ ...binding, bound_at: '2026-01-01T24:00:00Z' })).toThrow('bound_at is invalid');
    expect(() => validateEngineerBinding({
      ...binding,
      state: 'retired',
      bound_at: '2026-08-24T12:00:00.0001Z',
      retired_at: '2026-08-24T12:00:00.00009Z',
    })).toThrow('retired_at precedes bound_at');
  });
});
