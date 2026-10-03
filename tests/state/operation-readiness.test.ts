import { describe, expect, test } from 'bun:test';
import { resolve, type ArtifactRequirementKey } from '../../src/core/workflow/artifact-requirement-policy';
import { evaluateReadiness } from '../../src/core/workflow/operation-readiness';

describe('readiness separates edit/Stop from publication', () => {
  for (const profile of ['routine', 'high'] as const) {
    const requirements = { edit: resolve({profile,operation:'edit'}),stop:resolve({profile,operation:'stop'}),ship:resolve({profile,operation:'ship'}) };
    test(`${profile}: missing artifacts or failed checks never trap repair or Stop`, () => {
      const result = evaluateReadiness({profile,operation:'stop',requirements,evidence:{satisfiedRequirements:['safe_path'],hardBlockers:['checks_failed']}});
      expect(result).toMatchObject({ok:true,allowedToEdit:{decision:'allow'},allowedToStop:{decision:'allow'},readyToShip:{decision:'block'}});
    });
    test(`${profile}: unsafe edits fail and publication consumes exact evidence`, () => {
      expect(evaluateReadiness({profile,operation:'edit',requirements,evidence:{satisfiedRequirements:[]}}))
        .toMatchObject({ok:true,allowedToEdit:{decision:'block',reasons:['required_safe_path_missing']},allowedToStop:{decision:'allow'}});
      const evidence: ArtifactRequirementKey[]=['safe_path','subject_bound_targeted_evidence','candidate_revision_precondition'];
      expect(evaluateReadiness({profile,operation:'ship',requirements,evidence:{satisfiedRequirements:evidence}}))
        .toMatchObject({ok:true,readyToShip:{decision:'allow'}});
    });
  }
  test('malformed/mismatched authoritative decisions are not synthesized', () => {
    expect(evaluateReadiness({profile:'routine',operation:'edit',requirements:{edit:resolve({profile:'high',operation:'edit'}),stop:resolve({profile:'routine',operation:'stop'}),ship:resolve({profile:'routine',operation:'ship'})},evidence:{satisfiedRequirements:[]}}))
      .toMatchObject({ok:false,code:'REQUIREMENT_MISMATCH'});
  });
});
