import { describe, expect, test } from 'bun:test';
import { resolveWorkflowProfile } from '../../src/core/workflow/profile';
import { resolve } from '../../src/core/workflow/artifact-requirement-policy';
import { evaluateReadiness } from '../../src/core/workflow/operation-readiness';

describe('risk × operation contract', () => {
  for (const [profile, paths] of [['routine', ['src/format.ts']], ['high', ['src/security/policy.ts']]] as const) {
    test(`${profile}: one risk authority feeds all operation consumers`, () => {
      const risk = resolveWorkflowProfile({ targetPaths: paths });
      expect(risk).toMatchObject({ok:true,profile});
      if (!risk.ok) throw new Error(risk.message);
      const readiness = evaluateReadiness({profile:risk.profile,operation:'stop',requirements:{
        edit:resolve({profile:risk.profile,operation:'edit'}),
        stop:resolve({profile:risk.profile,operation:'stop'}),
        ship:resolve({profile:risk.profile,operation:'ship'}),
      },evidence:{satisfiedRequirements:['safe_path'],hardBlockers:['checks_failed']}});
      expect(readiness).toMatchObject({ok:true,allowedToEdit:{decision:'allow'},allowedToStop:{decision:'allow'},readyToShip:{decision:'block'}});
    });
  }
});
