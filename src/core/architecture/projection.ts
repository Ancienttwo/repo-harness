import {
  ARCHCTX_CAPABILITIES_SCHEMA_VERSION,
  projectionApplyReadbackResultInvariantIssues,
  projectionResultInvariantIssues,
  validateJsonSchema,
  type Json,
  type ProjectionApplyReadbackResultV1,
  type ProjectionRequestV1,
  type ProjectionResultV2,
} from 'archctx-contracts';
import projectionResultSchema from 'archctx-contracts/schemas/runtime/projection-result.schema.json';
import projectionReadbackSchema from 'archctx-contracts/schemas/runtime/projection-apply-readback.schema.json';

export const ARCHCTX_REQUIRED_VERSION = '0.6.3' as const;

export type ProjectionProvider = 'disabled' | 'archctx';
export type ProjectionApplyMode = 'disabled' | 'manual';

export interface ArchitectureProjectionPolicy {
  provider: ProjectionProvider;
  applyMode: ProjectionApplyMode;
  requiredVersion: string;
  timeoutMs: number;
}

export interface ArchitectureProjectionReadinessV1 {
  schemaVersion: 'repo-harness.architecture-projection-readiness/v1';
  modelAuthority: { source: 'registry' | 'archcontext'; ready: boolean };
  projectionProvider: { provider: ProjectionProvider; state: 'disabled' | 'missing' | 'mismatch' | 'error' | 'ready'; binaryPath: string | null; version: string | null; reason: string };
  codeFacts: { requirement: 'required'; state: 'not-evaluated' | 'ready' | 'unavailable' };
  apply: { mode: ProjectionApplyMode; enabled: boolean };
}

type JsonRecord = Record<string, unknown>;

export function readArchitectureProjectionPolicy(value: unknown): ArchitectureProjectionPolicy {
  const root = record(value, 'policy');
  const architecture = root.architecture === undefined ? {} : record(root.architecture, 'policy.architecture');
  const provider = architecture.projection_provider ?? 'disabled';
  const applyMode = architecture.projection_apply ?? 'disabled';
  const requiredVersion = architecture.projection_version ?? ARCHCTX_REQUIRED_VERSION;
  const timeoutMs = architecture.projection_timeout_ms ?? 120_000;
  if (provider !== 'disabled' && provider !== 'archctx') throw new Error('policy.architecture.projection_provider must be disabled|archctx');
  if (applyMode !== 'disabled' && applyMode !== 'manual') throw new Error('policy.architecture.projection_apply must be disabled|manual');
  if (provider === 'disabled') {
    if (applyMode !== 'disabled') throw new Error('projection_apply must be disabled when projection_provider is disabled');
    return { provider, applyMode, requiredVersion: ARCHCTX_REQUIRED_VERSION, timeoutMs: 120_000 };
  }
  if (typeof requiredVersion !== 'string' || requiredVersion.trim() === '') throw new Error('policy.architecture.projection_version must be a non-empty string');
  if (!Number.isInteger(timeoutMs) || (timeoutMs as number) < 1_000 || (timeoutMs as number) > 600_000) throw new Error('policy.architecture.projection_timeout_ms must be 1000..600000');
  return { provider, applyMode, requiredVersion, timeoutMs: timeoutMs as number };
}

/** The exact package pin is the whole compatibility contract: one archctx version owns one wire protocol. */
export function assertArchctxVersion(value: unknown, requiredVersion: string = ARCHCTX_REQUIRED_VERSION): void {
  const input = record(value, 'archctx capabilities');
  const pkg = record(input.package, 'archctx capabilities.package');
  if (input.schemaVersion !== ARCHCTX_CAPABILITIES_SCHEMA_VERSION || pkg.name !== 'archctx' || pkg.version !== requiredVersion) {
    throw new Error(`archctx package mismatch: expected archctx@${requiredVersion}, got ${String(pkg.name)}@${String(pkg.version)}`);
  }
}

/** ArchContext owns the result contract; repo-harness applies its published schema and invariants. */
export function assertProjectionResult(value: unknown, expectedRequestId: string): ProjectionResultV2 {
  const result = decode(projectionResultSchema, value, 'projection result') as unknown as ProjectionResultV2;
  const issues = projectionResultInvariantIssues(result);
  if (result.requestId !== expectedRequestId) issues.push('requestId mismatch');
  if (issues.length > 0) throw new Error(`projection result invalid: ${issues.join('; ')}`);
  return result;
}

/** A readback proves an earlier committed apply of this exact request; an absence proof means none exists. */
export function assertProjectionApplyReadbackResult(value: unknown, request: ProjectionRequestV1): ProjectionApplyReadbackResultV1 {
  const readback = decode(projectionReadbackSchema, value, 'projection readback');
  if (readback.schemaVersion === 'archcontext.projection-apply-absence/v1') throw new Error(`no committed projection apply exists for ${request.requestId}`);
  const result = readback as unknown as ProjectionApplyReadbackResultV1;
  const issues = projectionApplyReadbackResultInvariantIssues(result, request);
  if (issues.length > 0) throw new Error(`projection readback invalid: ${issues.join('; ')}`);
  return result;
}

function decode(schema: unknown, value: unknown, label: string): JsonRecord {
  const validation = validateJsonSchema(schema as Parameters<typeof validateJsonSchema>[0], value as Json);
  if (!validation.valid) throw new Error(`${label} invalid: ${validation.issues.slice(0, 5).map((issue) => `${issue.path} ${issue.message}`).join('; ')}`);
  return value as JsonRecord;
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as JsonRecord;
}
