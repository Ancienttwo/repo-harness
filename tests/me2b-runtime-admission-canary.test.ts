import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import {
  classifyMe2bRuntimeObservation,
  codexSandboxCommand,
  evaluateReadOnlySandboxControl,
  runMe2bRuntimeCanary,
  type Me2bHostProbeV2,
  type Me2bRuntimeControlsV2,
  type Me2bRuntimeObservationV2,
} from '../scripts/me2b-runtime-admission-canary';

const emptySha = `sha256:${'0'.repeat(64)}` as const;

const controls: Me2bRuntimeControlsV2 = Object.freeze({
  read_only_exit_code: 1,
  read_only_signal_code: null,
  read_only_stdout_sha256: emptySha,
  read_only_stderr_sha256: emptySha,
  read_only_stderr_excerpt: 'touch: <fixture>/read-only-sentinel: Operation not permitted',
  read_only_worktree_before_sha256: emptySha,
  read_only_worktree_after_sha256: emptySha,
  workspace_write_exit_code: 0,
  workspace_write_signal_code: null,
  workspace_write_stderr_sha256: emptySha,
  workspace_write_stderr_excerpt: '',
  static_parent_exit_code: 0,
  static_parent_stderr_sha256: emptySha,
  static_parent_stderr_excerpt: '',
});

const admitted: Me2bRuntimeObservationV2 = Object.freeze({
  read_only_worktree_mutation_denied: true,
  workspace_write_worktree_mutation_admitted: true,
  static_parent_mutation_before_checkpoint: true,
  static_parent_mutation_after_checkpoint: true,
  static_parent_control_alive_after_checkpoint: true,
  dynamic_parent_revocation: 'observed',
  parent_mutation_after_revocation: false,
  parent_control_alive_after_revocation: true,
  child_principal_at_effect: 'observed',
});

function fakeHost(id: string, observation: Me2bRuntimeObservationV2): Me2bHostProbeV2 {
  return Object.freeze({
    id,
    async probe(fixtureRoot: string) {
      expect(existsSync(fixtureRoot)).toBe(true);
      return Object.freeze({ controls, observation });
    },
  });
}

const fakeRuntime = Object.freeze({
  executable_realpath: '/opt/fake-codex',
  executable_sha256: emptySha,
  version: 'codex-cli test',
  sandbox_help_sha256: emptySha,
});

describe('ME-2B managed Parent/sandbox runtime admission canary', () => {
  test('admits an injected Host only after dynamic revocation, preserved Parent control and exact effect principal are observed end to end', async () => {
    const result = await runMe2bRuntimeCanary({
      runtime: fakeRuntime,
      host: fakeHost('fake-managed-host/v1', admitted),
    });
    expect(result.runtime.host_adapter).toBe('fake-managed-host/v1');
    expect(result.observation).toEqual(admitted);
    expect(result.decision).toEqual({ decision: 'admitted', reasons: [] });
  });

  test('rejects a launch-only Host without claiming its checkpoint was a revocation', async () => {
    const launchOnly: Me2bRuntimeObservationV2 = {
      ...admitted,
      dynamic_parent_revocation: 'probe_unavailable',
      parent_mutation_after_revocation: null,
      parent_control_alive_after_revocation: null,
      child_principal_at_effect: 'probe_unavailable',
    };
    const result = await runMe2bRuntimeCanary({
      runtime: fakeRuntime,
      host: fakeHost('fake-launch-only-host/v1', launchOnly),
    });
    expect(result.decision).toEqual({
      decision: 'runtime_not_admitted',
      reasons: [
        'dynamic_parent_revocation_probe_unavailable',
        'child_principal_at_effect_probe_unavailable',
      ],
    });
  });

  test('does not misclassify process death or missing post-revocation evidence as a usable Parent freeze', () => {
    expect(classifyMe2bRuntimeObservation({
      ...admitted,
      parent_control_alive_after_revocation: false,
    })).toEqual({ decision: 'runtime_not_admitted', reasons: ['parent_control_not_preserved'] });
    expect(classifyMe2bRuntimeObservation({
      ...admitted,
      parent_mutation_after_revocation: null,
      parent_control_alive_after_revocation: null,
    })).toEqual({
      decision: 'runtime_not_admitted',
      reasons: [
        'post_revocation_mutation_evidence_missing',
        'post_revocation_parent_control_evidence_missing',
      ],
    });
    expect(classifyMe2bRuntimeObservation({
      ...admitted,
      static_parent_mutation_after_checkpoint: false,
      static_parent_control_alive_after_checkpoint: false,
    })).toEqual({
      decision: 'runtime_not_admitted',
      reasons: ['static_parent_checkpoint_control_failed'],
    });
  });

  test('requires the exact read-only denial envelope instead of accepting arbitrary startup failures', () => {
    const valid = {
      exitCode: 1,
      signalCode: null,
      stdout: new Uint8Array(),
      stderrExcerpt: 'touch: <fixture>/read-only-sentinel: Operation not permitted',
      sentinelExists: false,
      worktreeBefore: new Uint8Array(),
      worktreeAfter: new Uint8Array(),
    };
    expect(evaluateReadOnlySandboxControl(valid)).toBe(true);
    expect(evaluateReadOnlySandboxControl({ ...valid, exitCode: 71 })).toBe(false);
    expect(evaluateReadOnlySandboxControl({ ...valid, stderrExcerpt: 'invalid permission profile' })).toBe(false);
    expect(evaluateReadOnlySandboxControl({ ...valid, signalCode: 'SIGKILL' })).toBe(false);
    expect(evaluateReadOnlySandboxControl({ ...valid, stdout: new TextEncoder().encode('unexpected') })).toBe(false);
    expect(evaluateReadOnlySandboxControl({ ...valid, sentinelExists: true })).toBe(false);
    expect(evaluateReadOnlySandboxControl({
      ...valid,
      worktreeAfter: new TextEncoder().encode('?? unexpected-file\n'),
    })).toBe(false);
  });

  test('keeps permission profiles launch-scoped in the exact Host argv', () => {
    expect(codexSandboxCommand('/opt/codex', ':read-only', '/tmp/repo', ['/usr/bin/touch', '--', '/tmp/repo/sentinel'])).toEqual([
      '/opt/codex',
      'sandbox',
      '--permission-profile',
      ':read-only',
      '--include-managed-config',
      '--cd',
      '/tmp/repo',
      '/usr/bin/touch',
      '--',
      '/tmp/repo/sentinel',
    ]);
    expect(codexSandboxCommand('/opt/codex', ':workspace', '/tmp/repo', ['/usr/bin/touch', '--', '/tmp/repo/sentinel'])).toEqual([
      '/opt/codex',
      'sandbox',
      '--permission-profile',
      ':workspace',
      '--include-managed-config',
      '--cd',
      '/tmp/repo',
      '/usr/bin/touch',
      '--',
      '/tmp/repo/sentinel',
    ]);
  });
});
