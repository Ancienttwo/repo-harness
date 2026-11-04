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
import { assertConfigurationPath, hostConfigurationRoot, readConfigurationFragment, replaceConfigurationFragment, writeOwnedConfiguration } from '../configuration-ownership';
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

/** The `statusLine` entry that install writes when `settings.json` has none. */
export const CLAUDE_STATUS_LINE = Object.freeze({ type: 'command', command: 'repo-harness-hook statusline' });

/** The documented one-line pipe that keeps an existing status line and also writes the quota capture. */
export const CLAUDE_STATUS_LINE_PIPE = `input=$(cat); printf '%s' "$input" | repo-harness-hook statusline >/dev/null; printf '%s' "$input" | <your status line command>`;

/**
 * Sets `statusLine` only when none exists. The configuration receipt records
 * the written entry, so uninstall removes it only while it still equals the
 * installed value. An existing status line is not changed.
 */
function ensureStatusLine(filePath: string): { readonly written: boolean; readonly note?: string } {
  const current = fs.readFileSync(filePath, 'utf-8');
  const fragment = readConfigurationFragment(filePath, current, 'statusLine');
  const owned = JSON.stringify(CLAUDE_STATUS_LINE);
  if (fragment === owned) return { written: false };
  if (fragment !== null) {
    return { written: false, note: `statusLine exists and is not changed. To capture Claude quota, set its command to: ${CLAUDE_STATUS_LINE_PIPE}` };
  }
  writeOwnedConfiguration(filePath, replaceConfigurationFragment(filePath, current, 'statusLine', owned), hostConfigurationRoot());
  return { written: true };
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
    const nextContent = formatJson(next);

    const created = !fs.existsSync(filePath);
    const hooksChanged = created || fs.readFileSync(filePath, 'utf-8') !== nextContent;
    if (hooksChanged) atomicWriteFileSync(filePath, nextContent);
    const statusLine = ensureStatusLine(filePath);
    const notes = statusLine.note ? [statusLine.note] : [];
    if (!hooksChanged && !statusLine.written) {
      return { files: [{ path: filePath, action: 'unchanged' }], ...(notes.length ? { notes } : {}) };
    }
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
    if (deepEqual(cleaned, data.hooks ?? {})) {
      return { files: [{ path: filePath, action: 'not-found' }] };
    }
    const next: SettingsFile = { ...data, hooks: cleaned };
    if (!opts.dryRun) atomicWriteFileSync(filePath, formatJson(next));
    return { files: [{ path: filePath, action: 'removed' }] };
  }
}

export const claudeTarget: AgentTarget = new ClaudeTarget();
