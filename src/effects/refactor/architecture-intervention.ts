import { execFileSync } from 'child_process';
import type { RecommendationV3 } from 'archctx-contracts';

import { projectRefactorArchitectureIntervention, type RefactorArchitectureInterventionV1 } from '../../core/refactor/architecture-intervention';
import { validateRefactorProgram, type RefactorProgramV1 } from '../../core/refactor/program';
import type { ProjectionResultV1 } from '../../core/architecture/projection';
import { applyArchitectureProjection } from '../architecture/projection-apply';
import { readRefactorRecommendationRecords } from './archctx-provider';
import { appendRefactorProgramEvent, readRefactorProgramStatus } from './program-store';

export class RefactorArchitectureInterventionEffectError extends Error {
  readonly code = 'refactor_architecture_approval_required' as const;
  constructor(message: string) { super(message); this.name = 'RefactorArchitectureInterventionEffectError'; }
}
function fail(message: string): never { throw new RefactorArchitectureInterventionEffectError(message); }
function same(left: readonly string[], right: readonly string[]): boolean { return left.length === right.length && left.every((entry, index) => entry === right[index]); }
export type RefactorRecommendationReader = (expectedHeadSha: string, repoRoot: string) => readonly RecommendationV3[];

function readIntervention(program: RefactorProgramV1, head: string, root: string, reader?: RefactorRecommendationReader): RefactorArchitectureInterventionV1 {
  const records = reader ? reader(head, root) : readRefactorRecommendationRecords(head, root).recommendations;
  const matches = records.filter((entry) => program.bindings.some((binding) => binding.recommendationId === entry.recommendationId && binding.recommendationDigest === entry.fingerprint));
  if (matches.length !== 1) fail('architecture intervention requires exactly one current ArchContext recommendation');
  return projectRefactorArchitectureIntervention(program, matches[0]!);
}

export interface PrepareRefactorArchitectureInterventionInput {
  readonly repo_root: string; readonly program: RefactorProgramV1; readonly expected_current_sha256: string;
  readonly idempotency_key: string; readonly observed_at: string; readonly env?: NodeJS.ProcessEnv;
  readonly recommendation_reader?: RefactorRecommendationReader;
}

export function prepareRefactorArchitectureIntervention(input: PrepareRefactorArchitectureInterventionInput) {
  const program = validateRefactorProgram(input.program); const status = readRefactorProgramStatus(input.repo_root, program.programId, input.env ?? process.env);
  if (status.current.state !== 'routing' && status.current.state !== 'architecture_approval_required') fail(`program is ${status.current.state}, not routing`);
  const head = execFileSync('git', ['rev-parse', '--verify', `${status.program.target_ref}^{commit}`], { cwd: input.repo_root, encoding: 'utf8' }).trim();
  if (head !== status.program.target_revision) fail('authorized target ref moved before architecture approval');
  const intervention = readIntervention(program, head, input.repo_root, input.recommendation_reader);
  const transition = appendRefactorProgramEvent({ repo_root: input.repo_root, program_id: program.programId, expected_current_sha256: input.expected_current_sha256,
    idempotency_key: input.idempotency_key, operation: 'require_architecture_approval', evidence_refs: [intervention.interventionDigest], observed_at: input.observed_at, env: input.env });
  return Object.freeze({ intervention, current: transition.current });
}

/** Apply the intervention's projection; the accepted major change must be the one the Program assessed. */
export function applyRefactorArchitectureIntervention(input: {
  readonly repo_root: string; readonly program: RefactorProgramV1; readonly expected_head_sha: string;
  readonly recommendation_reader?: RefactorRecommendationReader;
  readonly apply_projection?: (repoRoot: string) => ProjectionResultV1;
}): { readonly intervention: RefactorArchitectureInterventionV1; readonly result: ProjectionResultV1 } {
  const program = validateRefactorProgram(input.program); const intervention = readIntervention(program, input.expected_head_sha, input.repo_root, input.recommendation_reader);
  if (intervention.readiness !== 'approval_required') fail(`architecture target remains unresolved: ${intervention.targetDelta.unresolvedTargets.join(', ')}`);
  const result = (input.apply_projection ?? applyArchitectureProjection)(input.repo_root);
  const accepted = result.applyReceipt?.acceptedChange;
  if (!accepted || !same(accepted.affectedNodeIds, intervention.affectedNodeIds) || !same(accepted.reasonCodes, intervention.majorChangeReasons)) {
    fail('architecture projection did not accept the major change the Refactor intervention assessed');
  }
  return Object.freeze({ intervention, result });
}
