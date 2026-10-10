import {
  DEFAULT_GLOBAL_ARCHITECTURE,
  migrateRetiredGlobalArchitectureSettings,
  readGlobalArchitectureConfiguration,
} from '../../effects/architecture/projection-config';
import { readGlobalConfiguration } from '../../effects/configuration/global-configuration';
import { writePrivateConfiguration } from '../installer/configuration-ownership';
import type { GlobalRuntimeStep } from './global-runtime';

export function ensureGlobalArchitectureProjection(env: NodeJS.ProcessEnv = process.env): GlobalRuntimeStep {
  try {
    const migrated = migrateRetiredArchitectureSection(env);
    const current = readGlobalArchitectureConfiguration(env);
    if (!current.initialized) {
      writePrivateConfiguration(current.path, `${JSON.stringify({ ...current.config, architecture: DEFAULT_GLOBAL_ARCHITECTURE }, null, 2)}\n`, env);
    }
    const detail = !current.initialized ? `configured ${current.path}: archctx / manual`
      : migrated ? `migrated retired automatic projection settings in ${current.path}`
        : `using ${current.path}`;
    return { step: 'global architecture projection', status: 'ok', detail };
  } catch (error) {
    return { step: 'global architecture projection', status: 'failed', detail: error instanceof Error ? error.message : String(error) };
  }
}

function migrateRetiredArchitectureSection(env: NodeJS.ProcessEnv): boolean {
  const { path, config } = readGlobalConfiguration(env);
  const section = config.architecture;
  if (section === null || typeof section !== 'object' || Array.isArray(section)) return false;
  const migrated = migrateRetiredGlobalArchitectureSettings(section as Record<string, unknown>);
  if (!migrated) return false;
  writePrivateConfiguration(path, `${JSON.stringify({ ...config, architecture: migrated }, null, 2)}\n`, env);
  return true;
}
