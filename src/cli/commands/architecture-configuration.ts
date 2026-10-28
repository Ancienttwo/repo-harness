import {
  DEFAULT_GLOBAL_ARCHITECTURE,
  migrateRetiredGlobalArchitectureSettings,
  readGlobalArchitectureConfiguration,
} from '../../effects/architecture/projection-config';
import { mutateGlobalConfiguration } from '../../effects/configuration/global-configuration';
import { globalRuntimeScope, withRuntimeTransactionContext, type RuntimeTransactionContext } from '../../effects/locking/runtime-transaction-lock';
import type { GlobalRuntimeStep } from './global-runtime';

export function ensureGlobalArchitectureProjection(env: NodeJS.ProcessEnv = process.env, runtimeLock?: RuntimeTransactionContext): GlobalRuntimeStep {
  try {
    return withRuntimeTransactionContext(globalRuntimeScope(env), runtimeLock, (context): GlobalRuntimeStep => {
      const migrated = migrateRetiredArchitectureSection(env, context);
      const current = readGlobalArchitectureConfiguration(env);
      if (!current.initialized) {
        mutateGlobalConfiguration(env, (config) => ({ config: { ...config, architecture: DEFAULT_GLOBAL_ARCHITECTURE }, value: undefined }), { runtimeLock: context });
      }
      const detail = !current.initialized ? `configured ${current.path}: archctx / manual`
        : migrated ? `migrated retired automatic projection settings in ${current.path}`
          : `using ${current.path}`;
      return { step: 'global architecture projection', status: 'ok', detail };
    });
  } catch (error) {
    return { step: 'global architecture projection', status: 'failed', detail: error instanceof Error ? error.message : String(error) };
  }
}

function migrateRetiredArchitectureSection(env: NodeJS.ProcessEnv, runtimeLock: RuntimeTransactionContext): boolean {
  return mutateGlobalConfiguration(env, (config) => {
    const section = config.architecture;
    if (section === null || typeof section !== 'object' || Array.isArray(section)) return { value: false };
    const migrated = migrateRetiredGlobalArchitectureSettings(section as Record<string, unknown>);
    return migrated ? { config: { ...config, architecture: migrated }, value: true } : { value: false };
  }, { runtimeLock }).value;
}
