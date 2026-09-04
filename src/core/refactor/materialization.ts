import { createHash } from 'crypto';

import {
  validateWorkGraph,
  validateWorkPackageDefinition,
  type WorkGraphV1,
  type WorkPackageDefinitionV1,
  type WorkPackageRetryPolicyV1,
} from '../engineers/scheduling';
import { renderBacklogRow, type SprintBacklogSchema } from '../state/sprint-backlog-rows';
import { validateRefactorProgram, type RefactorProgramV1 } from './program';

export interface RefactorMaterializationArtifactV1 {
  readonly path: string;
  readonly bytes: string;
}

export interface RefactorMaterializationUnitV1 {
  readonly recommendationId: string;
  readonly architectureNodeId: string;
  readonly taskId: string;
  readonly taskText: string;
  readonly acceptanceText: string;
  readonly planPath: string;
  readonly planBytes: string;
  readonly kind: 'implementation' | 'investigation';
  readonly primaryCapability: string;
  readonly dependsOnWorkPackageIds: readonly string[];
  readonly priority: number;
  readonly requiredAcceptance: WorkPackageDefinitionV1['required_acceptance'];
  readonly rollbackBoundary: WorkPackageDefinitionV1['rollback_boundary'];
  readonly retryPolicy: WorkPackageRetryPolicyV1;
}

export interface ProjectRefactorMaterializationInput {
  readonly repositoryId: string;
  readonly sprintPath: string;
  readonly sprintSchema: SprintBacklogSchema;
  readonly firstRowIndex: number;
  readonly maximumModulesPerProgram: number;
  readonly program: RefactorProgramV1;
  readonly units: readonly RefactorMaterializationUnitV1[];
  readonly artifacts: readonly RefactorMaterializationArtifactV1[];
}

export interface ProjectedRefactorMaterializationV1 {
  readonly rows: readonly string[];
  readonly plans: readonly RefactorMaterializationArtifactV1[];
  readonly artifacts: readonly RefactorMaterializationArtifactV1[];
  readonly workGraph: WorkGraphV1;
}

export class RefactorMaterializationContractError extends Error {
  readonly code = 'refactor_materialization_invalid' as const;
  constructor(message: string) { super(message); this.name = 'RefactorMaterializationContractError'; }
}

function invalid(message: string): never { throw new RefactorMaterializationContractError(message); }
function exact(value: object, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) invalid(`${label} keys are invalid`);
}
function sha256(bytes: string): string { return `sha256:${createHash('sha256').update(bytes, 'utf8').digest('hex')}`; }
function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) invalid(`${label} must be unique`);
}
function safePath(path: string, label: string, suffix?: string): string {
  if (typeof path !== 'string' || !path || path.startsWith('/') || path.startsWith('-') || path.includes('\\') || path.includes('|')
    || path.split('/').some((part) => part === '' || part === '.' || part === '..')
    || (suffix !== undefined && !path.endsWith(suffix))) invalid(`${label} is unsafe`);
  return path;
}
function cell(value: string, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || /[|\r\n\u0000-\u001f\u007f]/u.test(value)) invalid(`${label} is invalid for a Sprint cell`);
  return value;
}

/**
 * Pure projection for Module 6. Semantic task, plan, acceptance, and rollback
 * bytes remain caller-owned; this boundary only proves that their references,
 * RefactorProgram bindings, Sprint rows, and Work Graph describe one unit set.
 */
export function projectRefactorMaterialization(input: ProjectRefactorMaterializationInput): ProjectedRefactorMaterializationV1 {
  exact(input, ['repositoryId', 'sprintPath', 'sprintSchema', 'firstRowIndex', 'maximumModulesPerProgram', 'program', 'units', 'artifacts'], 'materialization projection');
  const program = validateRefactorProgram(input.program);
  if (program.route !== 'module_refactor' && program.route !== 'cross_module_refactor' && program.route !== 'proof_required' && program.route !== 'architecture_intervention') {
    invalid(`route ${program.route} cannot be materialized as execution work`);
  }
  if (!Number.isSafeInteger(input.maximumModulesPerProgram) || input.maximumModulesPerProgram < 1) invalid('maximumModulesPerProgram is invalid');
  if (input.units.length === 0) invalid('materialization requires at least one unit');
  if (input.units.length > input.maximumModulesPerProgram) invalid('materialization exceeds maximumModulesPerProgram');
  if ((program.route === 'module_refactor' || program.route === 'proof_required') && input.units.length !== 1) invalid(`${program.route} requires exactly one Work Package`);
  if (program.bindings.length !== input.units.length) invalid('every unit must have exactly one RefactorProgram binding');

  input.units.forEach((unit, index) => exact(unit, ['recommendationId', 'architectureNodeId', 'taskId', 'taskText', 'acceptanceText', 'planPath', 'planBytes', 'kind', 'primaryCapability', 'dependsOnWorkPackageIds', 'priority', 'requiredAcceptance', 'rollbackBoundary', 'retryPolicy'], `units[${index}]`));
  input.artifacts.forEach((artifact, index) => { exact(artifact, ['path', 'bytes'], `artifacts[${index}]`); if (typeof artifact.bytes !== 'string') invalid(`artifacts[${index}].bytes must be a string`); });
  unique(input.units.map((unit) => unit.recommendationId), 'unit recommendationId');
  unique(input.units.map((unit) => unit.architectureNodeId), 'unit architectureNodeId');
  unique(input.units.map((unit) => unit.taskId), 'unit taskId');
  unique(input.units.map((unit) => unit.planPath), 'unit planPath');
  unique(input.artifacts.map((artifact) => artifact.path), 'artifact path');
  const artifactByPath = new Map(input.artifacts.map((artifact) => [safePath(artifact.path, 'artifact.path'), artifact]));
  const bindingByRecommendation = new Map(program.bindings.map((binding) => [binding.recommendationId, binding]));
  const workPackageIds = new Set(program.bindings.map((binding) => binding.workPackageId));

  const workPackages = input.units.map((unit) => {
    const binding = bindingByRecommendation.get(unit.recommendationId);
    if (!binding) invalid(`unit ${unit.recommendationId} has no binding`);
    if (!program.affectedNodeIds.includes(unit.architectureNodeId)) invalid(`unit ${unit.recommendationId} names an unaffected architecture node`);
    const expectedBoundary = program.route === 'cross_module_refactor' ? 'cross_module_stage' : program.route === 'architecture_intervention' ? 'architecture_intervention' : 'module';
    if (binding.executionBoundary !== expectedBoundary) invalid(`binding ${binding.recommendationId} has the wrong execution boundary`);
    if (binding.taskRef !== `${input.sprintPath}#${unit.taskId}`) invalid(`binding ${binding.recommendationId} does not reference its canonical Sprint task`);
    if ((program.route === 'proof_required') !== (unit.kind === 'investigation')) invalid('proof_required may only materialize investigation Work Packages');
    safePath(unit.planPath, 'planPath', '.md');
    if (typeof unit.planBytes !== 'string') invalid('planBytes must be a string');
    for (const dependency of unit.dependsOnWorkPackageIds) {
      if (!workPackageIds.has(dependency) || dependency === binding.workPackageId) invalid(`unit ${unit.recommendationId} has an invalid dependency`);
    }
    for (const policy of unit.requiredAcceptance) {
      const artifact = artifactByPath.get(policy.policy_ref);
      if (!artifact || sha256(artifact.bytes) !== policy.policy_revision) invalid(`acceptance policy ${policy.policy_ref} is not bound to exact artifact bytes`);
    }
    const rollbackArtifact = artifactByPath.get(unit.rollbackBoundary.boundary_ref);
    if (!rollbackArtifact || sha256(rollbackArtifact.bytes) !== unit.rollbackBoundary.boundary_revision) invalid(`rollback boundary ${unit.rollbackBoundary.boundary_ref} is not bound to exact artifact bytes`);
    if (unit.rollbackBoundary.boundary_id !== binding.workPackageId) invalid('one module must own one matching Work Package rollback boundary');
    return validateWorkPackageDefinition({
      work_package_id: binding.workPackageId,
      task_id: unit.taskId,
      primary_capability: unit.primaryCapability,
      depends_on: unit.dependsOnWorkPackageIds.map((workPackageId) => ({
        repository_id: input.repositoryId,
        work_package_id: workPackageId,
        required_state: 'canonical_done',
        acceptance_authority: null,
      })),
      priority: unit.priority,
      concurrency: { scope: 'repo', key: unit.architectureNodeId },
      execution_surface: 'contract',
      integration_group: program.route === 'cross_module_refactor' ? program.programId : null,
      required_acceptance: unit.requiredAcceptance,
      rollback_boundary: unit.rollbackBoundary,
      retry_policy: unit.retryPolicy,
    });
  });

  const plans = input.units.map((unit) => ({ path: safePath(unit.planPath, 'planPath', '.md'), bytes: unit.planBytes }));
  const rows = input.units.map((unit, index) => renderBacklogRow(input.sprintSchema, {
    index: String(input.firstRowIndex + index), id: unit.taskId, status: '[ ]', task: cell(unit.taskText, 'taskText'),
    mode: 'contract', acceptance: cell(unit.acceptanceText, 'acceptanceText'), plan: unit.planPath,
  }));
  return Object.freeze({
    rows: Object.freeze(rows), plans: Object.freeze(plans), artifacts: Object.freeze([...input.artifacts]),
    workGraph: validateWorkGraph({ protocol: 1, kind: 'repo-harness-work-graph', repository_id: input.repositoryId, sprint_path: input.sprintPath, lane: 'engineering-v2', work_packages: workPackages }),
  });
}
