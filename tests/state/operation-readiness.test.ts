import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  resolve,
  type ArtifactRequirementKey,
  type ArtifactRequirementOperation,
  type ArtifactRequirementResolveInput,
} from '../../src/core/workflow/artifact-requirement-policy';
import {
  evaluateReadiness,
  type EvaluateReadinessInput,
  type EvaluateReadinessResult,
} from '../../src/core/workflow/operation-readiness';
import type { WorkflowProfile } from '../../src/core/workflow/profile';

const FIXTURE_PATH = join(import.meta.dir, 'fixtures/loop-semantics/operation-readiness.json');
const CHARACTERIZATION_PATH = join(import.meta.dir, 'fixtures/loop-semantics/characterization.json');

interface RawResolveInput {
  readonly profile: string;
  readonly operation: string;
  readonly risk?: string;
  readonly policy?: { readonly require?: readonly string[] };
}

interface RawEvidence {
  readonly satisfiedRequirements: readonly string[];
  readonly hardBlockers?: readonly string[];
}

interface RawCaseInput {
  readonly profile: string;
  readonly operation: string;
  readonly requirements: {
    readonly edit: RawResolveInput;
    readonly stop: RawResolveInput;
    readonly ship: RawResolveInput;
  };
  readonly evidence: RawEvidence;
}

interface RawCase {
  readonly name: string;
  readonly input: RawCaseInput;
  readonly expected: EvaluateReadinessResult;
}

interface Fixture {
  readonly schema: string;
  readonly positive_cases: readonly RawCase[];
  readonly negative_cases: readonly RawCase[];
}

interface CharacterizationFixture {
  readonly cells: readonly { readonly name: string }[];
}

const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8')) as Fixture;
const characterization = JSON.parse(readFileSync(CHARACTERIZATION_PATH, 'utf-8')) as CharacterizationFixture;

// The fixture stores plain strings (JSON has no notion of the module's
// literal-union types); this boundary is the one place those strings become
// the typed resolve() input, exactly like a real caller would construct it.
function toResolveInput(raw: RawResolveInput): ArtifactRequirementResolveInput {
  const input: {
    profile: WorkflowProfile;
    operation: ArtifactRequirementOperation;
    risk?: WorkflowProfile;
    policy?: { require?: readonly ArtifactRequirementKey[] };
  } = {
    profile: raw.profile as WorkflowProfile,
    operation: raw.operation as ArtifactRequirementOperation,
  };
  if (raw.risk !== undefined) input.risk = raw.risk as WorkflowProfile;
  if (raw.policy !== undefined) {
    input.policy = { require: raw.policy.require as readonly ArtifactRequirementKey[] | undefined };
  }
  return input;
}

// Each of edit/stop/ship is resolved through the real ArtifactRequirementPolicy.resolve(),
// exactly like a real caller assembling evaluateReadiness's input -- this fixture never
// hand-authors a resolve() output shape, so it cannot drift from that module's own contract.
function toEvaluateReadinessInput(raw: RawCaseInput): EvaluateReadinessInput {
  return {
    profile: raw.profile as WorkflowProfile,
    operation: raw.operation as ArtifactRequirementOperation,
    requirements: {
      edit: resolve(toResolveInput(raw.requirements.edit)),
      stop: resolve(toResolveInput(raw.requirements.stop)),
      ship: resolve(toResolveInput(raw.requirements.ship)),
    },
    evidence: {
      satisfiedRequirements: raw.evidence.satisfiedRequirements as readonly ArtifactRequirementKey[],
      ...(raw.evidence.hardBlockers !== undefined ? { hardBlockers: raw.evidence.hardBlockers } : {}),
    },
  };
}

describe('evaluateReadiness fixture-driven matrix', () => {
  test('fixture declares exactly the nine frozen characterization cells with no duplicates', () => {
    expect(fixture.positive_cases).toHaveLength(9);
    const fixtureNames = new Set(fixture.positive_cases.map((testCase) => testCase.name));
    expect(fixtureNames.size).toBe(9);
    const frozenNames = new Set(characterization.cells.map((cell) => cell.name));
    expect(frozenNames.size).toBe(9);
    expect(fixtureNames).toEqual(frozenNames);
  });

  describe('positive cases (all nine profile x operation cells)', () => {
    for (const testCase of fixture.positive_cases) {
      test(testCase.name, () => {
        expect(evaluateReadiness(toEvaluateReadinessInput(testCase.input))).toEqual(testCase.expected);
      });
    }
  });

  describe('negative cases (requirement-unsatisfied variants, stop/ship independence, invalid input rejection)', () => {
    for (const testCase of fixture.negative_cases) {
      test(testCase.name, () => {
        expect(evaluateReadiness(toEvaluateReadinessInput(testCase.input))).toEqual(testCase.expected);
      });
    }
  });
});
