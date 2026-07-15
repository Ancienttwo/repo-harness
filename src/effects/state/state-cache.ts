import { mkdirSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { EffectiveState } from '../../core/state/types';

export const EFFECTIVE_STATE_CACHE = '.ai/harness/state/effective.json';

export interface StateCacheWriteEffects {
  readonly writeTemp: (path: string, content: string) => void;
  readonly publish: (tempPath: string, cachePath: string) => void;
  readonly removeTemp: (tempPath: string) => void;
}

const DEFAULT_CACHE_WRITE_EFFECTS: StateCacheWriteEffects = {
  writeTemp(path, content) {
    writeFileSync(path, content, { mode: 0o600 });
  },
  publish(tempPath, cachePath) {
    renameSync(tempPath, cachePath);
  },
  removeTemp(tempPath) {
    unlinkSync(tempPath);
  },
};

export function writeEffectiveStateCache(
  cwd: string,
  state: EffectiveState,
  effects: StateCacheWriteEffects = DEFAULT_CACHE_WRITE_EFFECTS,
): void {
  const cacheDir = join(cwd, '.ai/harness/state');
  const cachePath = join(cwd, EFFECTIVE_STATE_CACHE);
  mkdirSync(cacheDir, { recursive: true });
  const tempPath = `${cachePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    effects.writeTemp(tempPath, `${JSON.stringify(state, null, 2)}\n`);
    effects.publish(tempPath, cachePath);
  } catch (error) {
    try { effects.removeTemp(tempPath); } catch { /* temp may not have been created */ }
    throw error;
  }
}
