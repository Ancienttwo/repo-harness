import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  resolve,
  type ArtifactRequirementKey,
  type ArtifactRequirementOperation,
  type ArtifactRequirementResolveInput,
  type ArtifactRequirementResolveResult,
} from '../../src/core/workflow/artifact-requirement-policy';
import type { WorkflowProfile } from '../../src/core/workflow/profile';

const FIXTURE_PATH = join(import.meta.dir, 'fixtures/loop-semantics/artifact-requirement-policy.json');

interface RawCaseInput {
  readonly profile: string;
  readonly operation: string;
  readonly risk?: string;
  readonly policy?: { readonly require?: readonly string[] };
}

interface RawCase {
  readonly name: string;
  readonly input: RawCaseInput;
  readonly expected: ArtifactRequirementResolveResult;
}

interface Fixture {
  readonly schema: string;
  readonly positive_cases: readonly RawCase[];
  readonly negative_cases: readonly RawCase[];
}

const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8')) as Fixture;

// The fixture stores plain strings (JSON has no notion of the module's
// literal-union types); this boundary is the one place those strings become
// the typed resolve() input, exactly like a real caller would construct it.
function toResolveInput(raw: RawCaseInput): ArtifactRequirementResolveInput {
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

describe('ArtifactRequirementPolicy.resolve fixture-driven matrix', () => {
  test('fixture declares exactly nine positive cells with no duplicates', () => {
    expect(fixture.positive_cases).toHaveLength(9);
    const cellKeys = new Set(
      fixture.positive_cases.map((testCase) => `${testCase.input.profile}.${testCase.input.operation}`),
    );
    expect(cellKeys.size).toBe(9);
  });

  describe('positive cases (all nine profile x operation cells)', () => {
    for (const testCase of fixture.positive_cases) {
      test(testCase.name, () => {
        expect(resolve(toResolveInput(testCase.input))).toEqual(testCase.expected);
      });
    }
  });

  describe('negative cases (risk/policy raise semantics and invalid input rejection)', () => {
    for (const testCase of fixture.negative_cases) {
      test(testCase.name, () => {
        expect(resolve(toResolveInput(testCase.input))).toEqual(testCase.expected);
      });
    }
  });
});
