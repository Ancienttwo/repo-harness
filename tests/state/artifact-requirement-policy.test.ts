import { describe, expect, test } from 'bun:test';
import { resolve } from '../../src/core/workflow/artifact-requirement-policy';
import type { WorkflowProfile } from '../../src/core/workflow/profile';

describe('risk policy covers actual boundaries', () => {
  for (const profile of ['routine', 'high'] as const) {
    test(`${profile}: edit/Stop require no planning or acceptance ceremony`, () => {
      expect(resolve({ profile, operation: 'stop' })).toMatchObject({ ok: true, requirements: [] });
      expect(resolve({ profile, operation: 'edit' })).toMatchObject({ ok: true, requirements: [{ key: 'safe_path', status: 'required' }] });
      expect(resolve({ profile, operation: 'ship' })).toMatchObject({ ok: true, requirements: [
        { key: 'subject_bound_targeted_evidence', status: 'required' },
        { key: 'candidate_revision_precondition', status: 'required' },
      ] });
    });
  }
  test('retired profiles and ceremony overrides fail with clear diagnostics', () => {
    for (const profile of ['lite', 'standard', 'strict']) {
      expect(resolve({ profile: profile as WorkflowProfile, operation: 'edit' })).toMatchObject({ ok: false, code: 'INVALID_PROFILE' });
    }
    expect(resolve({ profile: 'routine', operation: 'ship', policy: { require: ['fresh_review'] } }))
      .toMatchObject({ ok: false, code: 'INVALID_POLICY_REQUIRE_KEY' });
  });
});
