import { describe, expect, test } from 'bun:test';
import {
  classifyMe2bRuntimeObservation,
  codexSandboxCommand,
  type Me2bRuntimeObservationV1,
} from '../scripts/me2b-runtime-admission-canary';

const admitted: Me2bRuntimeObservationV1 = Object.freeze({
  read_only_worktree_mutation_denied: true,
  workspace_write_worktree_mutation_admitted: true,
  parent_mutation_before_revocation: true,
  parent_mutation_after_revocation: false,
  parent_control_alive_after_revocation: true,
  dynamic_parent_revocation: 'observed',
  child_principal_at_effect: 'observed',
});

describe('ME-2B managed Parent/sandbox runtime admission canary', () => {
  test('admits only dynamic revocation with preserved Parent control and exact effect principal', () => {
    expect(classifyMe2bRuntimeObservation(admitted)).toEqual({ decision: 'admitted', reasons: [] });
  });

  test('rejects a static workspace-write sandbox whose live Parent still mutates after revocation', () => {
    expect(classifyMe2bRuntimeObservation({
      ...admitted,
      parent_mutation_after_revocation: true,
      dynamic_parent_revocation: 'unavailable',
      child_principal_at_effect: 'unavailable',
    })).toEqual({
      decision: 'runtime_not_admitted',
      reasons: [
        'dynamic_parent_revocation_unavailable',
        'parent_write_survived_revocation',
        'child_principal_at_effect_unavailable',
      ],
    });
  });

  test('does not misclassify process death as a usable Parent freeze', () => {
    expect(classifyMe2bRuntimeObservation({
      ...admitted,
      parent_control_alive_after_revocation: false,
    })).toEqual({ decision: 'runtime_not_admitted', reasons: ['parent_control_not_preserved'] });
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
