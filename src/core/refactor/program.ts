import {
  ARCHITECTURE_MAJOR_CHANGE_REASON_CODES,
  REFACTOR_SCALE_REASON_CODES,
  REFACTOR_SCALES,
  type ArchitectureMajorChangeReasonCode,
  type RefactorScale,
  type RefactorScaleReasonCode,
  recommendationV3InvariantIssues,
  type RecommendationV3,
} from 'archctx-contracts';

import {
  assertMessageExactKeys,
  assertMessageSha256,
  canonicalMessageBytes,
  canonicalMessageDigest,
  messageRequiredString,
} from '../messages/mechanics';
import { REFACTOR_PROVIDER_VERSION } from './policy';
import { projectRefactorWorkflowRoute, type RefactorWorkflowRoute } from './workflow-route';

export const REFACTOR_PROGRAM_PROTOCOL = 1 as const;

export type RefactorExecutionBoundary = 'module' | 'cross_module_stage' | 'architecture_intervention';

export interface RefactorProgramBindingV1 {
  readonly recommendationId: string;
  readonly recommendationDigest: string;
  readonly candidateAlias: string;
  readonly workPackageId: string;
  readonly taskRef: string;
  readonly executionBoundary: RefactorExecutionBoundary;
}

export interface RefactorProgramV1 {
  readonly protocol: typeof REFACTOR_PROGRAM_PROTOCOL;
  readonly programId: string;
  readonly baseMainSha: string;
  readonly archctxVersion: typeof REFACTOR_PROVIDER_VERSION;
  readonly providerStage: 'scan' | 'verify';
  readonly statisticsSnapshotDigest: string;
  readonly assessmentDigest: string;
  readonly proposalDigest: string | null;
  readonly proposalAuthor: { readonly kind: string; readonly source: string } | null;
  readonly scale: RefactorScale | null;
  readonly routeReasonCodes: readonly RefactorScaleReasonCode[];
  readonly majorChangeReasons: readonly ArchitectureMajorChangeReasonCode[];
  readonly route: RefactorWorkflowRoute;
  readonly affectedNodeIds: readonly string[];
  readonly bindings: readonly RefactorProgramBindingV1[];
  readonly programDigest: string;
}

export class RefactorProgramContractError extends Error {
  readonly code = 'refactor_program_invalid' as const;
  constructor(message: string) { super(message); this.name = 'RefactorProgramContractError'; }
}

function invalid(message: string): never { throw new RefactorProgramContractError(message); }
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: readonly string[], label: string): void { assertMessageExactKeys(value, keys, label, invalid); }
function text(value: unknown, field: string, pattern: RegExp): string {
  const result = messageRequiredString(value, field, invalid); if (!pattern.test(result)) invalid(`${field} is invalid`); return result;
}
function digest(value: unknown, field: string): string {
  const result = messageRequiredString(value, field, invalid); assertMessageSha256(result, field, invalid); return result;
}
function gitOid(value: unknown, field: string): string { return text(value, field, /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u); }
function unique(values: readonly string[], field: string): void { if (new Set(values).size !== values.length) invalid(`${field} must be unique`); }

function author(value: unknown): RefactorProgramV1['proposalAuthor'] {
  if (value === null) return null;
  const input = record(value, 'proposalAuthor'); exact(input, ['kind', 'source'], 'proposalAuthor');
  return Object.freeze({ kind: text(input.kind, 'proposalAuthor.kind', /^[a-z][a-z_]{0,63}$/u), source: text(input.source, 'proposalAuthor.source', /^[a-z][a-z_]{0,63}$/u) });
}

function binding(value: unknown, index: number): RefactorProgramBindingV1 {
  const label = `bindings[${index}]`; const input = record(value, label);
  exact(input, ['recommendationId', 'recommendationDigest', 'candidateAlias', 'workPackageId', 'taskRef', 'executionBoundary'], label);
  if (!['module', 'cross_module_stage', 'architecture_intervention'].includes(String(input.executionBoundary))) invalid(`${label}.executionBoundary is invalid`);
  return Object.freeze({
    recommendationId: text(input.recommendationId, `${label}.recommendationId`, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u),
    recommendationDigest: digest(input.recommendationDigest, `${label}.recommendationDigest`),
    candidateAlias: text(input.candidateAlias, `${label}.candidateAlias`, /^C(?:0[1-9]|[1-9][0-9])$/u),
    workPackageId: text(input.workPackageId, `${label}.workPackageId`, /^[a-z0-9][a-z0-9-]{0,127}$/u),
    taskRef: text(input.taskRef, `${label}.taskRef`, /^[^\u0000-\u001f\u007f]{1,512}$/u),
    executionBoundary: input.executionBoundary as RefactorExecutionBoundary,
  });
}

type ProgramBuildInput = Omit<RefactorProgramV1, 'protocol' | 'archctxVersion' | 'programDigest'>;

export function buildRefactorProgram(input: ProgramBuildInput): RefactorProgramV1 {
  if (input.scale !== null && !(REFACTOR_SCALES as readonly unknown[]).includes(input.scale)) invalid('scale is invalid');
  if (!Array.isArray(input.routeReasonCodes) || input.routeReasonCodes.some((entry) => !(REFACTOR_SCALE_REASON_CODES as readonly unknown[]).includes(entry))) invalid('routeReasonCodes are invalid');
  if (!Array.isArray(input.majorChangeReasons) || input.majorChangeReasons.some((entry) => !(ARCHITECTURE_MAJOR_CHANGE_REASON_CODES as readonly unknown[]).includes(entry))) invalid('majorChangeReasons are invalid');
  unique(input.routeReasonCodes, 'routeReasonCodes'); unique(input.majorChangeReasons, 'majorChangeReasons');
  const projected = projectRefactorWorkflowRoute(input.scale, input.routeReasonCodes, input.majorChangeReasons);
  if (input.route !== projected.route) invalid('route does not match the authoritative assessment projection');
  const proposalAuthor = author(input.proposalAuthor);
  if ((input.proposalDigest === null) !== (proposalAuthor === null) || (input.proposalDigest === null) !== (input.scale === null)) invalid('proposal, author, and scale presence must agree');
  const affectedNodeIds = input.affectedNodeIds.map((entry, index) => text(entry, `affectedNodeIds[${index}]`, /^[a-z][a-z0-9.-]{1,255}$/u)); unique(affectedNodeIds, 'affectedNodeIds');
  const bindings = input.bindings.map(binding);
  for (const field of ['recommendationId', 'recommendationDigest', 'candidateAlias', 'workPackageId', 'taskRef'] as const) unique(bindings.map((entry) => entry[field]), `bindings.${field}`);
  const basis = {
    protocol: REFACTOR_PROGRAM_PROTOCOL,
    programId: text(input.programId, 'programId', /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u),
    baseMainSha: gitOid(input.baseMainSha, 'baseMainSha'), archctxVersion: REFACTOR_PROVIDER_VERSION,
    providerStage: input.providerStage, statisticsSnapshotDigest: digest(input.statisticsSnapshotDigest, 'statisticsSnapshotDigest'),
    assessmentDigest: digest(input.assessmentDigest, 'assessmentDigest'), proposalDigest: input.proposalDigest === null ? null : digest(input.proposalDigest, 'proposalDigest'),
    proposalAuthor, scale: input.scale, routeReasonCodes: [...input.routeReasonCodes], majorChangeReasons: [...input.majorChangeReasons], route: input.route,
    affectedNodeIds, bindings,
  } as const;
  if (basis.providerStage !== 'scan' && basis.providerStage !== 'verify') invalid('providerStage is invalid');
  return Object.freeze({ ...basis, routeReasonCodes: Object.freeze(basis.routeReasonCodes), majorChangeReasons: Object.freeze(basis.majorChangeReasons), affectedNodeIds: Object.freeze(affectedNodeIds), bindings: Object.freeze(bindings), programDigest: canonicalMessageDigest(basis) });
}

export function validateRefactorProgram(value: unknown): RefactorProgramV1 {
  const input = record(value, 'RefactorProgramV1');
  exact(input, ['protocol', 'programId', 'baseMainSha', 'archctxVersion', 'providerStage', 'statisticsSnapshotDigest', 'assessmentDigest', 'proposalDigest', 'proposalAuthor', 'scale', 'routeReasonCodes', 'majorChangeReasons', 'route', 'affectedNodeIds', 'bindings', 'programDigest'], 'RefactorProgramV1');
  if (input.protocol !== REFACTOR_PROGRAM_PROTOCOL || input.archctxVersion !== REFACTOR_PROVIDER_VERSION || !Array.isArray(input.routeReasonCodes) || !Array.isArray(input.majorChangeReasons) || !Array.isArray(input.affectedNodeIds) || !Array.isArray(input.bindings)) invalid('RefactorProgramV1 shape is invalid');
  const built = buildRefactorProgram(input as unknown as ProgramBuildInput);
  if (input.programDigest !== built.programDigest) invalid('programDigest is stale');
  return built;
}

function same(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

/** Bind caller-supplied execution structure to the complete accepted ArchContext proposal payload. */
export function assertRefactorProgramRecommendationAuthority(
  programInput: RefactorProgramV1,
  recommendations: readonly RecommendationV3[],
): readonly RecommendationV3[] {
  const program = validateRefactorProgram(programInput);
  const matches = program.bindings.map((binding) => {
    const exactMatches = recommendations.filter((entry) => entry.recommendationId === binding.recommendationId && entry.fingerprint === binding.recommendationDigest);
    if (exactMatches.length !== 1) invalid(`recommendation is not accepted by ArchContext: ${binding.recommendationId}`);
    const recommendation = exactMatches[0]!;
    const issues = recommendationV3InvariantIssues(recommendation);
    if (issues.length || recommendation.status !== 'accepted' || recommendation.category !== 'refactor_proposal') {
      invalid(`accepted recommendation is not a valid refactor proposal: ${binding.recommendationId}`);
    }
    const payload = recommendation.payload;
    if (program.statisticsSnapshotDigest !== payload.baselineSnapshotDigest
      || program.assessmentDigest !== payload.assessmentDigest
      || program.proposalDigest !== payload.proposalDigest
      || program.proposalAuthor?.kind !== recommendation.authoredBy.kind
      || program.proposalAuthor?.source !== recommendation.authoredBy.source
      || program.scale !== payload.scale
      || !same(program.affectedNodeIds, payload.affectedNodeIds)
      || !same(program.majorChangeReasons, payload.majorChangeReasons)) {
      invalid(`program semantics disagree with the accepted recommendation: ${binding.recommendationId}`);
    }
    return recommendation;
  });
  return Object.freeze(matches);
}

export const canonicalRefactorProgramBytes = (value: RefactorProgramV1): string => canonicalMessageBytes(validateRefactorProgram(value) as unknown as Record<string, unknown>);
