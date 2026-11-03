import {
  DEFAULT_GLOBAL_ARCHITECTURE,
  migrateRetiredGlobalArchitectureSettings,
  readGlobalArchitectureConfiguration,
} from '../../effects/architecture/projection-config';
import type { ArchitectureSetupStep, GlobalConfigurationWrite } from '../../core/architecture/contracts';

/** `write` runs each change under the runtime transaction of the caller. */
export function ensureGlobalArchitectureProjection(env: NodeJS.ProcessEnv, write: GlobalConfigurationWrite): ArchitectureSetupStep {
  try {
    const migrated = write((config) => {
      const section = config.architecture;
      if (section === null || typeof section !== 'object' || Array.isArray(section)) return { value: false };
      const retired = migrateRetiredGlobalArchitectureSettings(section as Record<string, unknown>);
      return retired ? { config: { ...config, architecture: retired }, value: true } : { value: false };
    });
    const current = readGlobalArchitectureConfiguration(env);
    if (!current.initialized) write((config) => ({ config: { ...config, architecture: DEFAULT_GLOBAL_ARCHITECTURE }, value: undefined }));
    const detail = !current.initialized ? `configured ${current.path}: archctx / manual`
      : migrated ? `migrated retired automatic projection settings in ${current.path}`
        : `using ${current.path}`;
    return { step: 'global architecture projection', status: 'ok', detail };
  } catch (error) {
    return { step: 'global architecture projection', status: 'failed', detail: error instanceof Error ? error.message : String(error) };
  }
}
