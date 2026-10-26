import { createHash } from 'crypto';

import { canonicalize } from '../evidence/canonical-json';
import type { JsonValue } from '../evidence/types';

export const ENGINEER_PROFILE_PROTOCOL = 1 as const;
export const ENGINEER_PROFILE_KIND = 'repo-harness-module-engineer-profile' as const;

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const ENGINEER_ID_PATTERN = /^engineer:capability\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/u;
const CAPABILITY_ID_PATTERN = /^capability\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/u;
const SOP_REF_PATTERN = /^agents\/engineers\/sops\/[a-z0-9][a-z0-9-]*\.md$/u;

export const ENGINEER_DELEGATION_ROLES = [
  'explorer',
  'root-cause-prover',
  'fast-worker',
  'deep-worker',
  'gatekeeper',
] as const;

export type EngineerDelegationRole = (typeof ENGINEER_DELEGATION_ROLES)[number];

export interface ModuleEngineerProfileV1 {
  readonly protocol: typeof ENGINEER_PROFILE_PROTOCOL;
  readonly kind: typeof ENGINEER_PROFILE_KIND;
  readonly engineer_id: string;
  readonly capability_id: string;
  readonly sop_ref: string;
  readonly delegation_policy: {
    readonly allowed_roles: readonly EngineerDelegationRole[];
    readonly max_depth: number;
    readonly max_parallel_readers: number;
    readonly max_parallel_writers: number;
  };
  readonly max_active_claims: number;
  readonly escalation_policy: {
    readonly acceptance: 'independent_plane';
  };
}

export type EngineerProfileBindingErrorCode = 'engineer_profile_invalid';

export class EngineerProfileBindingError extends Error {
  constructor(
    readonly code: EngineerProfileBindingErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'EngineerProfileBindingError';
  }
}

function invalidProfile(message: string): never {
  throw new EngineerProfileBindingError('engineer_profile_invalid', message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  subject: string,
  invalid: (message: string) => never,
): void {
  const actual = Object.keys(value).sort();
  const fields = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(fields)) invalid(`${subject} fields are invalid`);
}

function requiredString(value: unknown, field: string, invalid: (message: string) => never): string {
  if (typeof value !== 'string' || value.length === 0) invalid(`${field} is required`);
  return value;
}

function assertInteger(value: unknown, field: string, minimum: number, invalid: (message: string) => never): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) invalid(`${field} is invalid`);
}

function assertDigest(value: string, field: string, invalid: (message: string) => never): void {
  if (!SHA256_PATTERN.test(value)) invalid(`${field} is invalid`);
}

function assertEngineerId(value: string, invalid: (message: string) => never): void {
  if (!ENGINEER_ID_PATTERN.test(value)) invalid('engineer_id is invalid');
}

export function engineerSha256(value: string | Buffer): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function canonicalEngineerJson(value: unknown): string {
  return canonicalize(value as JsonValue);
}

export function validateModuleEngineerProfile(value: unknown): ModuleEngineerProfileV1 {
  if (!isRecord(value)) invalidProfile('engineer profile must be an object');
  assertExactKeys(value, [
    'protocol', 'kind', 'engineer_id', 'capability_id', 'sop_ref',
    'delegation_policy', 'max_active_claims', 'escalation_policy',
  ], 'engineer profile', invalidProfile);
  if (value.protocol !== ENGINEER_PROFILE_PROTOCOL || value.kind !== ENGINEER_PROFILE_KIND) {
    invalidProfile('engineer profile protocol or kind is invalid');
  }
  const engineerId = requiredString(value.engineer_id, 'engineer_id', invalidProfile);
  const capabilityId = requiredString(value.capability_id, 'capability_id', invalidProfile);
  const sopRef = requiredString(value.sop_ref, 'sop_ref', invalidProfile);
  assertEngineerId(engineerId, invalidProfile);
  if (!CAPABILITY_ID_PATTERN.test(capabilityId)) invalidProfile('capability_id is invalid');
  if (engineerId !== `engineer:${capabilityId}`) invalidProfile('engineer_id must bind the exact capability_id');
  if (!SOP_REF_PATTERN.test(sopRef)) invalidProfile('sop_ref is invalid');

  if (!isRecord(value.delegation_policy)) invalidProfile('delegation_policy must be an object');
  assertExactKeys(value.delegation_policy, [
    'allowed_roles', 'max_depth', 'max_parallel_readers', 'max_parallel_writers',
  ], 'delegation_policy', invalidProfile);
  const roles = value.delegation_policy.allowed_roles;
  if (!Array.isArray(roles) || roles.length === 0 || roles.some((role) => !ENGINEER_DELEGATION_ROLES.includes(role as EngineerDelegationRole))) {
    invalidProfile('delegation_policy.allowed_roles is invalid');
  }
  if (new Set(roles).size !== roles.length) invalidProfile('delegation_policy.allowed_roles contains duplicates');
  assertInteger(value.delegation_policy.max_depth, 'delegation_policy.max_depth', 0, invalidProfile);
  assertInteger(value.delegation_policy.max_parallel_readers, 'delegation_policy.max_parallel_readers', 1, invalidProfile);
  assertInteger(value.delegation_policy.max_parallel_writers, 'delegation_policy.max_parallel_writers', 1, invalidProfile);
  assertInteger(value.max_active_claims, 'max_active_claims', 1, invalidProfile);

  if (!isRecord(value.escalation_policy)) invalidProfile('escalation_policy must be an object');
  assertExactKeys(value.escalation_policy, ['acceptance'], 'escalation_policy', invalidProfile);
  if (value.escalation_policy.acceptance !== 'independent_plane') {
    invalidProfile('escalation_policy is invalid');
  }

  return Object.freeze({
    protocol: ENGINEER_PROFILE_PROTOCOL,
    kind: ENGINEER_PROFILE_KIND,
    engineer_id: engineerId,
    capability_id: capabilityId,
    sop_ref: sopRef,
    delegation_policy: Object.freeze({
      allowed_roles: Object.freeze([...(roles as EngineerDelegationRole[])]),
      max_depth: value.delegation_policy.max_depth,
      max_parallel_readers: value.delegation_policy.max_parallel_readers,
      max_parallel_writers: value.delegation_policy.max_parallel_writers,
    }),
    max_active_claims: value.max_active_claims,
    escalation_policy: Object.freeze({
      acceptance: 'independent_plane',
    }),
  });
}

export function canonicalModuleEngineerProfileBytes(profile: ModuleEngineerProfileV1): string {
  return canonicalEngineerJson(validateModuleEngineerProfile(profile));
}

export function engineerContractRevision(
  profile: ModuleEngineerProfileV1,
  sopBytes: string,
  capabilityRevision: string,
): string {
  assertDigest(capabilityRevision, 'capability_revision', invalidProfile);
  if (typeof sopBytes !== 'string' || Buffer.byteLength(sopBytes, 'utf8') === 0) invalidProfile('SOP bytes are required');
  return engineerSha256(canonicalEngineerJson({
    profile_canonical_bytes: canonicalModuleEngineerProfileBytes(profile),
    sop_utf8_bytes: sopBytes,
    capability_revision: capabilityRevision,
  }));
}
