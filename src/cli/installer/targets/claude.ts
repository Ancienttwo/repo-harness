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
import { assertConfigurationPath, hostConfigurationRoot } from '../configuration-ownership';
import { MANAGED_TAG, isRepoHarnessManagedHookCommand } from '../../../core/adoption/managed-hook-config';
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

/**
 * The `statusLine` entry that install writes. The managed tag is its ownership
 * proof, as for the managed hook commands: a user edit removes the tag, and the
 * entry is then the user's.
 */
export const CLAUDE_STATUS_LINE = Object.freeze({ type: 'command', command: `: ${MANAGED_TAG}; exec repo-harness-hook statusline` });

/** The documented one-line pipe that keeps an existing status line and also writes the quota capture. */
export const CLAUDE_STATUS_LINE_PIPE = `input=$(cat); printf '%s' "$input" | repo-harness-hook statusline >/dev/null; printf '%s' "$input" | <your status line command>`;

function isManagedStatusLine(value: unknown): boolean {
  return typeof value === 'object' && value !== null && isRepoHarnessManagedHookCommand((value as { command?: unknown }).command);
}

class ClaudeTarget implements AgentTarget {
  readonly id = 'claude' as const;
  readonly displayName = 'Claude Code';

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
    assertConfigurationPath(filePath, hostConfigurationRoot());
    const data = readJsonOrEmpty<SettingsFile>(filePath);
    const cleaned = stripManagedEntries(data.hooks);
    const managed = buildManagedHooks('claude');
    const merged = mergeHooks(cleaned, managed);
    const next: SettingsFile = { ...data, hooks: merged };
    // Set the status line only when none exists; refresh it only while it carries the tag.
    const userStatusLine = data.statusLine !== undefined && !isManagedStatusLine(data.statusLine);
    if (!userStatusLine) next.statusLine = CLAUDE_STATUS_LINE;
    const notes = userStatusLine
      ? [`statusLine exists and is not changed. To capture Claude quota, set its command to: ${CLAUDE_STATUS_LINE_PIPE}`]
      : [];
    const nextContent = formatJson(next);

    const created = !fs.existsSync(filePath);
    if (!created) {
      const current = fs.readFileSync(filePath, 'utf-8');
      if (current === nextContent) {
        return { files: [{ path: filePath, action: 'unchanged' }], ...(notes.length ? { notes } : {}) };
      }
    }
    atomicWriteFileSync(filePath, nextContent);
    return {
      files: [{ path: filePath, action: created ? 'created' : 'updated' }],
      notes: [created
        ? 'Claude Code will pick up hooks on next ConfigChange event; no restart needed.'
        : 'Claude Code auto-reloads settings.json on write (verified Phase 0).', ...notes],
    };
  }

  uninstall(loc: Location, opts: { dryRun?: boolean } = {}): WriteResult {
    const filePath = userConfigPath(loc);
    assertConfigurationPath(filePath, hostConfigurationRoot());
    if (!fs.existsSync(filePath)) {
      return { files: [{ path: filePath, action: 'not-found' }] };
    }
    const data = readJsonOrEmpty<SettingsFile>(filePath);
    const cleaned = stripManagedEntries(data.hooks);
    const ownedStatusLine = isManagedStatusLine(data.statusLine);
    if (deepEqual(cleaned, data.hooks ?? {}) && !ownedStatusLine) {
      return { files: [{ path: filePath, action: 'not-found' }] };
    }
    const next: SettingsFile = { ...data, hooks: cleaned };
    if (ownedStatusLine) delete next.statusLine;
    if (!opts.dryRun) atomicWriteFileSync(filePath, formatJson(next));
    return { files: [{ path: filePath, action: 'removed' }] };
  }
}

export const claudeTarget: AgentTarget = new ClaudeTarget();
