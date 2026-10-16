/**
 * Claude Code hook-runtime target.
 *
 * Writes route-registry managed adapter entries under the `hooks` field of
 * ~/.claude/settings.json (--location global). Phase 0 verified Claude auto-reloads
 * settings.json via ConfigChange seconds after a write, no restart needed.
 *
 * `settings.json` carries non-hook config too (themes, MCP, etc.), so the
 * installer must merge into the existing object rather than overwrite.
 * Tag-based managed entries leave sibling user-authored hook entries intact
 * (Phase 0 baseline showed a sibling `rtk hook claude` entry that must survive).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { assertConfigurationPath } from '../configuration-ownership';
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

interface SettingsFile {
  hooks?: HooksByEvent;
  [key: string]: unknown;
}

function userConfigPath(loc: Location): string {
  if (loc !== 'global') {
    throw new Error('claudeTarget: hook adapters require --location global');
  }
  // Prefer $HOME env so tests can isolate via temp dirs; os.homedir() is
  // cached and ignores runtime $HOME mutations in some Node/Bun versions.
  return path.join(process.env.HOME ?? os.homedir(), '.claude', 'settings.json');
}

class ClaudeTarget implements AgentTarget {
  readonly id = 'claude' as const;
  readonly displayName = 'Claude Code';
  readonly docsUrl = 'https://code.claude.com';

  supportsLocation(loc: Location): boolean {
    return loc === 'global';
  }

  detect(loc: Location): DetectionResult {
    const filePath = userConfigPath(loc);
    const installed = fs.existsSync(path.dirname(filePath));
    let alreadyConfigured = false;
    if (fs.existsSync(filePath)) {
      try {
        const data = readJsonOrEmpty<SettingsFile>(filePath);
        for (const entries of Object.values(data.hooks ?? {})) {
          if ((entries ?? []).some(isManagedEntry)) {
            alreadyConfigured = true;
            break;
          }
        }
      } catch {
        // Invalid JSON: leave alreadyConfigured false.
      }
    }
    return { installed, alreadyConfigured, configPath: filePath };
  }

  install(loc: Location, opts: InstallOptions): WriteResult {
    const filePath = userConfigPath(loc);
    assertConfigurationPath(filePath);
    const data = readJsonOrEmpty<SettingsFile>(filePath);
    const cleaned = stripManagedEntries(data.hooks);
    const managed = buildManagedHooks('claude', opts.profile);
    const merged = mergeHooks(cleaned, managed);
    const next: SettingsFile = { ...data, hooks: merged };
    const nextContent = formatJson(next);

    const created = !fs.existsSync(filePath);
    if (!created) {
      const current = fs.readFileSync(filePath, 'utf-8');
      if (current === nextContent) {
        return { files: [{ path: filePath, action: 'unchanged' }] };
      }
    }
    atomicWriteFileSync(filePath, nextContent);
    return {
      files: [{ path: filePath, action: created ? 'created' : 'updated' }],
      notes: [created
        ? 'Claude Code will pick up hooks on next ConfigChange event; no restart needed.'
        : 'Claude Code auto-reloads settings.json on write (verified Phase 0).'],
    };
  }

  uninstall(loc: Location, opts: { dryRun?: boolean } = {}): WriteResult {
    const filePath = userConfigPath(loc);
    assertConfigurationPath(filePath);
    if (!fs.existsSync(filePath)) {
      return { files: [{ path: filePath, action: 'not-found' }] };
    }
    const data = readJsonOrEmpty<SettingsFile>(filePath);
    const cleaned = stripManagedEntries(data.hooks);
    if (deepEqual(cleaned, data.hooks ?? {})) {
      return { files: [{ path: filePath, action: 'not-found' }] };
    }
    const next: SettingsFile = { ...data, hooks: cleaned };
    if (!opts.dryRun) atomicWriteFileSync(filePath, formatJson(next));
    return { files: [{ path: filePath, action: 'removed' }] };
  }

  describePaths(loc: Location): string[] {
    return [userConfigPath(loc)];
  }
}

export const claudeTarget: AgentTarget = new ClaudeTarget();
