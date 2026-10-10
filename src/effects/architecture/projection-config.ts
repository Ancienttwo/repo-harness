import { readGlobalConfiguration } from '../configuration/global-configuration';
import { readArchitectureProjectionPolicy, type ArchitectureProjectionPolicy } from '../../core/architecture/projection';

export const DEFAULT_GLOBAL_ARCHITECTURE = {
  projection_provider: 'archctx',
  projection_apply: 'manual',
  projection_timeout_ms: 120_000,
} as const;

const SETTINGS = new Set(['projection_provider', 'projection_apply', 'projection_timeout_ms']);

export function readGlobalArchitectureConfiguration(env: NodeJS.ProcessEnv = process.env): {
  path: string; config: Record<string, unknown>; initialized: boolean; policy: ArchitectureProjectionPolicy;
} {
  const { path, config: value } = readGlobalConfiguration(env);
  if (value.architecture !== undefined) {
    const settings = value.architecture;
    if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) throw new Error(`Global architecture configuration must be an object: ${path}`);
    const fields = settings as Record<string, unknown>;
    if (migrateRetiredGlobalArchitectureSettings(fields)) {
      throw new Error(`Retired global architecture setting from the automatic projection queue; run \`repo-harness update\` to migrate: ${path}`);
    }
    for (const key of Object.keys(fields)) if (!SETTINGS.has(key)) throw new Error(`Unknown global architecture setting ${key}: ${path}`);
    if (fields.projection_timeout_ms !== undefined && (!Number.isInteger(fields.projection_timeout_ms) || (fields.projection_timeout_ms as number) < 1000 || (fields.projection_timeout_ms as number) > 600000)) throw new Error(`Invalid global projection_timeout_ms: ${path}`);
    if (fields.projection_provider !== 'archctx' && fields.projection_provider !== 'disabled') throw new Error(`Invalid global projection_provider: ${path}`);
    if (fields.projection_apply !== 'manual' && fields.projection_apply !== 'disabled') throw new Error(`Invalid global projection_apply: ${path}`);
  }
  try {
    return { path, config: value, initialized: value.architecture !== undefined, policy: readArchitectureProjectionPolicy(value) };
  } catch (error) { throw new Error(`Invalid global architecture configuration at ${path}: ${error instanceof Error ? error.message : String(error)}`); }
}

/**
 * One-shot migration of the settings retired with the automatic projection
 * queue: `projection_apply: automatic` becomes `manual` and
 * `projection_failure_gate` is dropped. Returns null when nothing is retired.
 */
export function migrateRetiredGlobalArchitectureSettings(settings: Record<string, unknown>): Record<string, unknown> | null {
  if (settings.projection_apply !== 'automatic' && !Object.hasOwn(settings, 'projection_failure_gate')) return null;
  const { projection_failure_gate: _retired, ...kept } = settings;
  return kept.projection_apply === 'automatic' ? { ...kept, projection_apply: 'manual' } : kept;
}

export function loadArchitectureProjectionPolicy(env: NodeJS.ProcessEnv = process.env): ArchitectureProjectionPolicy {
  return readGlobalArchitectureConfiguration(env).policy;
}
