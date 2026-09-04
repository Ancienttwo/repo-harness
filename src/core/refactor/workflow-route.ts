import {
  ARCHITECTURE_MAJOR_CHANGE_REASON_CODES,
  REFACTOR_SCALE_REASON_CODES,
  REFACTOR_SCALES,
  type ArchitectureMajorChangeReasonCode,
  type RefactorScale,
  type RefactorScaleReasonCode,
} from 'archctx-contracts';

export const REFACTOR_WORKFLOW_ROUTES = Object.freeze([
  'module_refactor',
  'cross_module_refactor',
  'architecture_intervention',
  'proof_required',
  'no_action',
] as const);
export type RefactorWorkflowRoute = (typeof REFACTOR_WORKFLOW_ROUTES)[number];

export interface RefactorWorkflowRouteProjectionV1 {
  readonly route: RefactorWorkflowRoute;
  readonly routeReasonCodes: readonly RefactorScaleReasonCode[];
}

export class RefactorWorkflowRouteError extends Error {
  readonly code = 'refactor_route_conflict' as const;

  constructor(message: string) {
    super(message);
    this.name = 'RefactorWorkflowRouteError';
  }
}

function conflict(message: string): never {
  throw new RefactorWorkflowRouteError(message);
}

function validateInputs(
  scale: RefactorScale | null,
  scaleReasonCodes: readonly RefactorScaleReasonCode[],
  majorChangeReasons: readonly ArchitectureMajorChangeReasonCode[],
): void {
  if (scale !== null && !(REFACTOR_SCALES as readonly unknown[]).includes(scale)) conflict('scale is outside the ArchContext closed vocabulary');
  if (!Array.isArray(scaleReasonCodes) || scaleReasonCodes.some((reason) => !(REFACTOR_SCALE_REASON_CODES as readonly unknown[]).includes(reason))) conflict('scaleReasonCodes contain an unknown value');
  if (!Array.isArray(majorChangeReasons) || majorChangeReasons.some((reason) => !(ARCHITECTURE_MAJOR_CHANGE_REASON_CODES as readonly unknown[]).includes(reason))) conflict('majorChangeReasons contain an unknown value');
  if (new Set(scaleReasonCodes).size !== scaleReasonCodes.length || new Set(majorChangeReasons).size !== majorChangeReasons.length) conflict('route inputs must not contain duplicate reasons');
}

export function projectRefactorWorkflowRoute(
  scale: RefactorScale | null,
  scaleReasonCodes: readonly RefactorScaleReasonCode[],
  majorChangeReasons: readonly ArchitectureMajorChangeReasonCode[],
): RefactorWorkflowRouteProjectionV1 {
  validateInputs(scale, scaleReasonCodes, majorChangeReasons);
  const route: RefactorWorkflowRoute = scale === 'architecture' ? 'architecture_intervention'
    : scale === 'cross_module' ? 'cross_module_refactor'
      : scale === 'module' ? 'module_refactor'
        : scale === 'insufficient_evidence' || scale === 'model_adoption_required' ? 'proof_required'
          : 'no_action';
  return Object.freeze({ route, routeReasonCodes: Object.freeze([...scaleReasonCodes]) });
}

export function validateRefactorWorkflowRouteProjection(
  scale: RefactorScale | null,
  scaleReasonCodes: readonly RefactorScaleReasonCode[],
  majorChangeReasons: readonly ArchitectureMajorChangeReasonCode[],
  candidate: RefactorWorkflowRouteProjectionV1,
): RefactorWorkflowRouteProjectionV1 {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)
    || Object.keys(candidate).length !== 2 || !Object.hasOwn(candidate, 'route') || !Object.hasOwn(candidate, 'routeReasonCodes')) conflict('route projection must contain exactly route and routeReasonCodes');
  const projected = projectRefactorWorkflowRoute(scale, scaleReasonCodes, majorChangeReasons);
  if (candidate.route !== projected.route
    || !Array.isArray(candidate.routeReasonCodes)
    || candidate.routeReasonCodes.length !== projected.routeReasonCodes.length
    || candidate.routeReasonCodes.some((reason, index) => reason !== projected.routeReasonCodes[index])) conflict('route projection does not match the authoritative assessment inputs');
  return projected;
}
