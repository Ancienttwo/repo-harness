import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { join } from 'path';
import type { EffectiveState } from '../../core/state/types';

export const EFFECTIVE_STATE_CACHE = '.ai/harness/state/effective.json';

export interface StateCacheWriteEffects {
  readonly writeTemp: (path: string, content: string | Buffer) => void;
  readonly publish: (tempPath: string, cachePath: string) => void;
  readonly removeTemp: (tempPath: string) => void;
}

export interface StateCachePublication {
  /** Restore the exact prior cache bytes, or remove the newly created cache. */
  rollback(): void;
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

function readPriorCache(cachePath: string): Buffer | null {
  try {
    return readFileSync(cachePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function replaceCacheBytes(
  cachePath: string,
  content: string | Buffer,
  effects: StateCacheWriteEffects,
): void {
  const tempPath = `${cachePath}.tmp-${process.pid}-${randomUUID()}`;
  try {
    effects.writeTemp(tempPath, content);
    effects.publish(tempPath, cachePath);
  } catch (error) {
    try { effects.removeTemp(tempPath); } catch { /* temp may not have been created */ }
    throw error;
  }
}

/**
 * Atomically replace the ignored cache and retain enough prior bytes to undo
 * the replacement until the Git-common-dir version owner commits.
 */
export function publishEffectiveStateCache(
  cwd: string,
  state: EffectiveState,
  effects: StateCacheWriteEffects = DEFAULT_CACHE_WRITE_EFFECTS,
): StateCachePublication {
  const cachePath = join(cwd, EFFECTIVE_STATE_CACHE);
  const prior = readPriorCache(cachePath);
  replaceCacheBytes(cachePath, `${JSON.stringify(state, null, 2)}\n`, effects);
  return {
    rollback() {
      if (prior === null) {
        try {
          unlinkSync(cachePath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
        return;
      }
      replaceCacheBytes(cachePath, prior, DEFAULT_CACHE_WRITE_EFFECTS);
    },
  };
}

export function writeEffectiveStateCache(
  cwd: string,
  state: EffectiveState,
  effects: StateCacheWriteEffects = DEFAULT_CACHE_WRITE_EFFECTS,
): void {
  publishEffectiveStateCache(cwd, state, effects);
}
