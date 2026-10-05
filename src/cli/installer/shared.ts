/**
 * Shared installer helpers: atomic JSON writes, idempotent unchanged detection.
 *
 * Atomic writes prevent partial-write corruption visible to the host process
 * (Claude Code auto-reloads `~/.claude/settings.json` via ConfigChange and
 * could race a non-atomic write — see docs/architecture/global-hook-runtime.md).
 *
 * Deep equality is used so re-installing with identical adapter content
 * returns `action: 'unchanged'`. Critical because Codex hashes adapter
 * entries by content + position; a byte-identical re-write avoids spurious
 * trust prompts (verified Phase 0).
 */

import * as fs from 'fs';
import * as path from 'path';

export function atomicWriteFileSync(filePath: string, content: string, options: { readonly mode?: number } = {}): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  // The rename installs a new inode. Without an explicit mode, keep the
  // replaced file's permission bits so a private config never widens.
  const mode = options.mode ?? fs.statSync(filePath, { throwIfNoEntry: false })?.mode;
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tmp, content, { encoding: 'utf-8', mode: mode === undefined ? undefined : 0o600 });
    if (mode !== undefined) fs.chmodSync(tmp, mode & 0o777);
    fs.renameSync(tmp, filePath);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

export function readJsonOrEmpty<T = Record<string, unknown>>(filePath: string): T {
  if (!fs.existsSync(filePath)) return {} as T;
  const raw = fs.readFileSync(filePath, 'utf-8');
  if (raw.trim() === '') return {} as T;
  return JSON.parse(raw) as T;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const oa = a as Record<string, unknown>;
  const ob = b as Record<string, unknown>;
  const ka = Object.keys(oa).sort();
  const kb = Object.keys(ob).sort();
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return false;
    if (!deepEqual(oa[ka[i]], ob[kb[i]])) return false;
  }
  return true;
}

/**
 * Format JSON with 2-space indent + trailing newline — matches the style
 * `.codex/hooks.json` and `.claude/settings.json` use in this repo, so the
 * deep-equal check against on-disk content lines up byte-for-byte after a
 * round-trip read/serialize.
 */
export function formatJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
