/**
 * Codex CLI hook-runtime target.
 *
 * Writes 8 managed adapter entries to ~/.codex/hooks.json (Phase 0 verified
 * Codex 0.130.0+ supports user-level hooks at this path; trust prompt fires
 * once per new (command, key) tuple, byte-identical re-runs hash-skip).
 *
 * supportsLocation('local') returns false — Codex has no project-local hook
 * config concept (verified Phase 0 2026-05-28). The installer skips Codex
 * cleanly when the user picks --location local.
 *
 * Tag-based managed entries (`MANAGED_TAG` from managed-entries.ts) ensure
 * uninstall removes only what install wrote, preserving any sibling
 * user-authored hook entries on the same file.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type {
  AgentTarget,
  DetectionResult,
  InstallOptions,
  Location,
  WriteResult,
} from '../types';
import {
  atomicWriteFileSync,
  deepEqual,
  formatJson,
  readJsonOrEmpty,
} from '../shared';
import {
  buildManagedHooks,
  isManagedEntry,
  mergeHooks,
  stripManagedEntries,
  type HooksByEvent,
} from '../managed-entries';

interface HooksFile {
  hooks?: HooksByEvent;
  [key: string]: unknown;
}

function globalConfigPath(): string {
  // Prefer $HOME env so tests can isolate via temp dirs; os.homedir() is
  // cached and ignores runtime $HOME mutations in some Node/Bun versions.
  return path.join(process.env.HOME ?? os.homedir(), '.codex', 'hooks.json');
}

function globalTomlConfigPath(): string {
  return path.join(process.env.HOME ?? os.homedir(), '.codex', 'config.toml');
}

function ensureRequestUserInputToml(): WriteResult['files'][number] {
  const filePath = globalTomlConfigPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const desiredLine = 'default_mode_request_user_input = true';
  if (!fs.existsSync(filePath)) {
    atomicWriteFileSync(filePath, `${desiredLine}\n`);
    return { path: filePath, action: 'created' };
  }

  const current = fs.readFileSync(filePath, 'utf-8');
  if (/^default_mode_request_user_input\s*=\s*true\s*$/m.test(current)) {
    return { path: filePath, action: 'unchanged' };
  }

  let next: string;
  if (/^default_mode_request_user_input\s*=/m.test(current)) {
    next = current.replace(/^default_mode_request_user_input\s*=.*$/m, desiredLine);
  } else if (/^\[/m.test(current)) {
    next = current.replace(/^\[/m, `${desiredLine}\n\n[`);
  } else {
    next = `${current.replace(/\s*$/, '')}\n${desiredLine}\n`;
  }

  if (next === current) {
    return { path: filePath, action: 'unchanged' };
  }
  atomicWriteFileSync(filePath, next);
  return { path: filePath, action: 'updated' };
}

class CodexTarget implements AgentTarget {
  readonly id = 'codex' as const;
  readonly displayName = 'Codex CLI';
  readonly docsUrl = 'https://github.com/openai/codex';

  supportsLocation(loc: Location): boolean {
    return loc === 'global';
  }

  detect(loc: Location): DetectionResult {
    if (loc !== 'global') {
      return { installed: false, alreadyConfigured: false };
    }
    const filePath = globalConfigPath();
    const installed = fs.existsSync(path.dirname(filePath));
    let alreadyConfigured = false;
    if (fs.existsSync(filePath)) {
      try {
        const data = readJsonOrEmpty<HooksFile>(filePath);
        for (const entries of Object.values(data.hooks ?? {})) {
          if ((entries ?? []).some(isManagedEntry)) {
            alreadyConfigured = true;
            break;
          }
        }
      } catch {
        // Invalid JSON: surface configPath but report not-configured.
      }
    }
    return { installed, alreadyConfigured, configPath: filePath };
  }

  install(loc: Location, _opts: InstallOptions): WriteResult {
    if (loc !== 'global') {
      throw new Error(
        'codexTarget.install: Codex has no project-local hook config; use --location global',
      );
    }
    const filePath = globalConfigPath();
    const data = readJsonOrEmpty<HooksFile>(filePath);
    const cleaned = stripManagedEntries(data.hooks);
    const managed = buildManagedHooks('codex');
    const merged = mergeHooks(cleaned, managed);
    const next: HooksFile = { ...data, hooks: merged };
    const nextContent = formatJson(next);
    const tomlResult = ensureRequestUserInputToml();

    const created = !fs.existsSync(filePath);
    if (!created) {
      const current = fs.readFileSync(filePath, 'utf-8');
      if (current === nextContent) {
        return { files: [{ path: filePath, action: 'unchanged' }, tomlResult] };
      }
    }
    atomicWriteFileSync(filePath, nextContent);
    return {
      files: [{ path: filePath, action: created ? 'created' : 'updated' }, tomlResult],
      notes: created
        ? ['Restart Codex to register new hook trust hashes.']
        : ['Existing hash entries stay trusted; only new (command, key) tuples re-prompt.'],
    };
  }

  uninstall(loc: Location): WriteResult {
    if (loc !== 'global') return { files: [] };
    const filePath = globalConfigPath();
    if (!fs.existsSync(filePath)) {
      return { files: [{ path: filePath, action: 'not-found' }] };
    }
    const data = readJsonOrEmpty<HooksFile>(filePath);
    const cleaned = stripManagedEntries(data.hooks);
    if (deepEqual(cleaned, data.hooks ?? {})) {
      return { files: [{ path: filePath, action: 'not-found' }] };
    }
    const next: HooksFile = { ...data, hooks: cleaned };
    atomicWriteFileSync(filePath, formatJson(next));
    return {
      files: [{ path: filePath, action: 'removed' }],
      notes: ['~/.codex/config.toml [hooks.state] entries are not GC-ed by Codex; remove manually if desired.'],
    };
  }

  describePaths(loc: Location): string[] {
    return loc === 'global' ? [globalConfigPath(), globalTomlConfigPath()] : [];
  }
}

export const codexTarget: AgentTarget = new CodexTarget();
