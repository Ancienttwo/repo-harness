/** Pure deterministic workflow-risk policy. */
export type WorkflowProfile = 'lite' | 'standard' | 'strict';

export type WorkflowOperationKind =
  | 'inspect'
  | 'edit'
  | 'bugfix'
  | 'feature'
  | 'multi-file'
  | 'cross-capability'
  | 'auth'
  | 'payment'
  | 'security'
  | 'schema'
  | 'migration'
  | 'deploy'
  | 'release'
  | 'public-api'
  | 'destructive';

export interface WorkflowProfileInput {
  targetPaths?: readonly string[];
  /**
   * Additional paths to include in strict-category token detection only
   * (never in targetPathCount/medium-scope counting). Callers that filter
   * targetPaths down to an implementation-surface subset (Phase C2) still
   * want the pre-filter raw batch scanned for strict tokens here, since a
   * workflow-surface path (docs/*, *.md, ...) can legitimately carry a real
   * strict-category signal (e.g. docs/auth/runbook.md) that must not be lost
   * just because it is administrative/ceremony content. Always unioned with
   * targetPaths for the scan; omit when there is no separate raw set.
   */
  strictScanPaths?: readonly string[];
  capabilityIds?: readonly string[];
  capabilityCount?: number;
  operationKind?: WorkflowOperationKind;
  explicitOverride?: WorkflowProfile;
}

export interface WorkflowProfileSignals {
  targetPathCount: number;
  capabilityCount: number;
  operationKind: WorkflowOperationKind;
  strictCategories: readonly StrictRiskCategory[];
  mediumScope: boolean;
  crossCapability: boolean;
}

const WORKFLOW_PROFILES = new Set<WorkflowProfile>(['lite', 'standard', 'strict']);
const OPERATION_KINDS = new Set<WorkflowOperationKind>([
  'inspect', 'edit', 'bugfix', 'feature', 'multi-file', 'cross-capability',
  'auth', 'payment', 'security', 'schema', 'migration', 'deploy', 'release',
  'public-api', 'destructive',
]);

export interface WorkflowProfileResolution {
  ok: true;
  profile: WorkflowProfile;
  riskFloor: WorkflowProfile;
  reasons: readonly string[];
  signals: WorkflowProfileSignals;
}

export interface WorkflowProfileError {
  ok: false;
  code: 'INVALID_RISK_INPUT' | 'PROFILE_BELOW_RISK_FLOOR';
  message: string;
  requestedProfile: WorkflowProfile | null;
  riskFloor: WorkflowProfile;
  reasons: readonly string[];
}

export type WorkflowProfileResult = WorkflowProfileResolution | WorkflowProfileError;

export type StrictRiskCategory =
  | 'auth'
  | 'payment'
  | 'security'
  | 'schema'
  | 'migration'
  | 'deploy'
  | 'release'
  | 'public-api'
  | 'destructive';

const PROFILE_RANK: Readonly<Record<WorkflowProfile, number>> = {
  lite: 0,
  standard: 1,
  strict: 2,
};

const STRICT_OPERATION_CATEGORIES: Readonly<Partial<Record<WorkflowOperationKind, StrictRiskCategory>>> = {
  auth: 'auth',
  payment: 'payment',
  security: 'security',
  schema: 'schema',
  migration: 'migration',
  deploy: 'deploy',
  release: 'release',
  'public-api': 'public-api',
  destructive: 'destructive',
};

const STRICT_CATEGORY_TOKENS: Readonly<Record<Exclude<StrictRiskCategory, 'destructive'>, ReadonlySet<string>>> = {
  auth: new Set(['auth', 'authentication', 'authorization', 'oauth', 'oidc', 'session']),
  payment: new Set(['payment', 'payments', 'billing', 'checkout', 'stripe']),
  security: new Set(['security', 'secret', 'secrets', 'credential', 'credentials']),
  schema: new Set(['schema', 'schemas']),
  migration: new Set(['migration', 'migrations', 'migrate']),
  deploy: new Set(['deploy', 'deployment', 'deployments']),
  release: new Set(['release', 'releases']),
  'public-api': new Set(['api', 'openapi', 'swagger']),
};

const STRICT_CATEGORY_ORDER: readonly StrictRiskCategory[] = [
  'auth',
  'payment',
  'security',
  'schema',
  'migration',
  'deploy',
  'release',
  'public-api',
  'destructive',
];

const MEDIUM_TARGET_PATH_COUNT = 4;

function normalizedTokens(value: string): ReadonlySet<string> {
  return new Set(
    value
      .toLowerCase()
      .replaceAll('\\', '/')
      .split(/[^a-z0-9]+/u)
      .filter(Boolean),
  );
}

function intersects(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  for (const value of left) {
    if (right.has(value)) return true;
  }
  return false;
}

function strictCategoriesFor(
  targetPaths: readonly string[],
  capabilityIds: readonly string[],
  operationKind: WorkflowOperationKind,
): readonly StrictRiskCategory[] {
  const categories = new Set<StrictRiskCategory>();
  const operationCategory = STRICT_OPERATION_CATEGORIES[operationKind];
  if (operationCategory) categories.add(operationCategory);

  const tokenSets = [...targetPaths, ...capabilityIds].map(normalizedTokens);
  for (const category of STRICT_CATEGORY_ORDER) {
    if (category === 'destructive') continue;
    const categoryTokens = STRICT_CATEGORY_TOKENS[category];
    if (tokenSets.some((tokens) => intersects(tokens, categoryTokens))) categories.add(category);
  }

  return STRICT_CATEGORY_ORDER.filter((category) => categories.has(category));
}

function uniqueNonEmpty(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort();
}

/**
 * Resolve runtime workflow ceremony from deterministic repository signals.
 *
 * This deliberately has no prompt/natural-language input. Callers may use language
 * to suggest work, but it cannot lower or establish this safety floor.
 */
export function resolveWorkflowProfile(input: WorkflowProfileInput): WorkflowProfileResult {
  const targetPaths = uniqueNonEmpty(input.targetPaths);
  const capabilityIds = uniqueNonEmpty(input.capabilityIds);
  const runtimeOperationKind = input.operationKind as string | undefined;
  const runtimeOverride = input.explicitOverride as string | undefined;
  if (runtimeOperationKind !== undefined && !OPERATION_KINDS.has(runtimeOperationKind as WorkflowOperationKind)) {
    return {
      ok: false,
      code: 'INVALID_RISK_INPUT',
      message: `unknown operationKind: ${runtimeOperationKind}`,
      requestedProfile: null,
      riskFloor: 'strict',
      reasons: ['risk-floor:invalid-operation-kind'],
    };
  }
  if (runtimeOverride !== undefined && !WORKFLOW_PROFILES.has(runtimeOverride as WorkflowProfile)) {
    return {
      ok: false,
      code: 'INVALID_RISK_INPUT',
      message: `unknown explicit profile: ${runtimeOverride}`,
      requestedProfile: null,
      riskFloor: 'strict',
      reasons: ['risk-floor:invalid-explicit-profile'],
    };
  }
  if (
    targetPaths.length === 0 &&
    capabilityIds.length === 0 &&
    input.capabilityCount === undefined &&
    (runtimeOperationKind === undefined || runtimeOperationKind === 'edit' || runtimeOperationKind === 'bugfix')
  ) {
    if (runtimeOverride === 'strict') {
      return {
        ok: true,
        profile: 'strict',
        riskFloor: 'strict',
        reasons: ['risk-floor:strict:signals-unavailable', 'explicit-override:equal:strict'],
        signals: {
          targetPathCount: 0,
          capabilityCount: 0,
          operationKind: (runtimeOperationKind as WorkflowOperationKind | undefined) ?? 'edit',
          strictCategories: [],
          mediumScope: false,
          crossCapability: false,
        },
      };
    }
    return {
      ok: false,
      code: 'INVALID_RISK_INPUT',
      message: 'deterministic risk signals are unavailable',
      requestedProfile: (runtimeOverride as WorkflowProfile | undefined) ?? null,
      riskFloor: 'strict',
      reasons: ['risk-floor:strict:signals-unavailable'],
    };
  }
  const operationKind = (runtimeOperationKind as WorkflowOperationKind | undefined) ?? 'edit';
  const declaredCapabilityCount = input.capabilityCount ?? capabilityIds.length;

  if (!Number.isInteger(declaredCapabilityCount) || declaredCapabilityCount < 0) {
    return {
      ok: false,
      code: 'INVALID_RISK_INPUT',
      message: 'capabilityCount must be a non-negative integer',
      requestedProfile: input.explicitOverride ?? null,
      riskFloor: 'strict',
      reasons: ['risk-floor:invalid-capability-count'],
    };
  }

  const capabilityCount = Math.max(declaredCapabilityCount, capabilityIds.length);
  // Strict-token detection deliberately scans the union of targetPaths (the
  // filtered, medium-scope-counted set) and strictScanPaths (the caller's
  // raw pre-filter set, if any) -- see WorkflowProfileInput.strictScanPaths.
  // targetPathCount/mediumScope/crossCapability below stay on the filtered
  // targetPaths only; only the strict-category scan widens.
  const strictScanPaths = uniqueNonEmpty([...(input.targetPaths ?? []), ...(input.strictScanPaths ?? [])]);
  const strictCategories = strictCategoriesFor(strictScanPaths, capabilityIds, operationKind);
  const crossCapability = capabilityCount > 1 || operationKind === 'cross-capability';
  const mediumScope = targetPaths.length >= MEDIUM_TARGET_PATH_COUNT || operationKind === 'multi-file';

  let riskFloor: WorkflowProfile = 'lite';
  const reasons: string[] = [];

  if (strictCategories.length > 0) {
    riskFloor = 'strict';
    reasons.push(...strictCategories.map((category) => `risk-floor:strict:${category}`));
  } else if (crossCapability) {
    riskFloor = 'standard';
    reasons.push('risk-floor:standard:cross-capability');
  } else if (operationKind === 'feature') {
    riskFloor = 'standard';
    reasons.push('risk-floor:standard:feature');
  } else if (mediumScope) {
    riskFloor = 'standard';
    reasons.push('risk-floor:standard:medium-scope');
  } else {
    reasons.push('risk-floor:lite:local-low-risk');
  }

  if (
    input.explicitOverride !== undefined &&
    PROFILE_RANK[input.explicitOverride] < PROFILE_RANK[riskFloor]
  ) {
    return {
      ok: false,
      code: 'PROFILE_BELOW_RISK_FLOOR',
      message: `explicit profile ${input.explicitOverride} is below deterministic risk floor ${riskFloor}`,
      requestedProfile: input.explicitOverride,
      riskFloor,
      reasons,
    };
  }

  const profile = input.explicitOverride ?? riskFloor;
  if (input.explicitOverride && input.explicitOverride !== riskFloor) {
    reasons.push(`explicit-override:raise:${input.explicitOverride}`);
  } else if (input.explicitOverride) {
    reasons.push(`explicit-override:equal:${input.explicitOverride}`);
  }

  return {
    ok: true,
    profile,
    riskFloor,
    reasons,
    signals: {
      targetPathCount: targetPaths.length,
      capabilityCount,
      operationKind,
      strictCategories,
      mediumScope,
      crossCapability,
    },
  };
}
