/**
 * `repo-harness migrate` — remove repo-harness-owned project-level hook
 * adapters after the user-level typed adapter cutover (dry-run default;
 * --apply commits).
 *
 * Targets two legacy file shapes:
 *   - <repo>/.codex/hooks.json       (Phase 0 / pre-CLI Codex adapter)
 *   - <repo>/.claude/settings.json   (Phase 0 / pre-CLI Claude adapter, hooks segment)
 *
 * Identification is owned by core/adoption/managed-hook-config.ts and shared
 * with install and adopt. User-authored sibling hooks (for example
 * `rtk hook claude`) do not match and survive migration.
 *
 * Safety:
 *   - --dry-run is default; --apply explicitly mutates.
 *   - Per-file backup before --apply: <file>.repo-harness-migrate-backup.
 *   - If the file's hooks segment becomes empty after removal, the field is
 *     dropped entirely (cleaner for Claude settings.json which has non-hook config).
 */

import * as fs from 'fs';
import * as path from 'path';
import { atomicWriteFileSync, formatJson, readJsonOrEmpty } from '../installer/shared';
import { stripRepoHarnessManagedHooks } from '../../core/adoption/managed-hook-config';

export interface MigrateOptions {
  cwd?: string;
  apply?: boolean;
}

export interface MigratePlanFile {
  path: string;
  legacyEntriesFound: number;
  legacyEntries: readonly { event: string; command: string }[];
  action: 'no-op' | 'remove' | 'remove-and-clean-hooks-segment';
}

export interface MigratePlan {
  files: MigratePlanFile[];
  apply: boolean;
}

interface SettingsOrHooksFile {
  hooks?: unknown;
  [key: string]: unknown;
}

function planForFile(filePath: string): MigratePlanFile | null {
  if (!fs.existsSync(filePath)) return null;
  const data = readJsonOrEmpty<SettingsOrHooksFile>(filePath);
  const { hooks: cleaned, removed } = stripRepoHarnessManagedHooks(data.hooks);
  if (removed.length === 0) {
    return { path: filePath, legacyEntriesFound: 0, legacyEntries: [], action: 'no-op' };
  }
  const action: MigratePlanFile['action'] =
    Object.keys(cleaned).length === 0 ? 'remove-and-clean-hooks-segment' : 'remove';
  return {
    path: filePath,
    legacyEntriesFound: removed.length,
    legacyEntries: removed,
    action,
  };
}

function applyForFile(filePath: string): void {
  const backupPath = `${filePath}.repo-harness-migrate-backup`;
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(filePath, backupPath);
  }
  const data = readJsonOrEmpty<SettingsOrHooksFile>(filePath);
  const { hooks: cleaned } = stripRepoHarnessManagedHooks(data.hooks);
  const next: SettingsOrHooksFile = { ...data, hooks: cleaned };
  if (Object.keys(cleaned).length === 0) {
    delete (next as Record<string, unknown>).hooks;
  }
  atomicWriteFileSync(filePath, formatJson(next));
}

export function runMigrate(opts: MigrateOptions = {}): MigratePlan {
  const cwd = opts.cwd ?? process.cwd();
  const apply = opts.apply === true;
  const files: MigratePlanFile[] = [];
  const candidates = [
    path.join(cwd, '.codex/hooks.json'),
    path.join(cwd, '.claude/settings.json'),
  ];
  for (const filePath of candidates) {
    const plan = planForFile(filePath);
    if (!plan) continue;
    files.push(plan);
    if (apply && plan.action !== 'no-op') {
      applyForFile(filePath);
    }
  }
  return { files, apply };
}

export function formatMigratePlan(plan: MigratePlan, asJson = false): string {
  if (asJson) return JSON.stringify(plan, null, 2);
  const lines: string[] = [];
  lines.push(plan.apply ? '--apply mode (mutating)' : '--dry-run mode (no changes)');
  lines.push('');
  if (plan.files.length === 0) {
    lines.push('  no legacy hook files found in current repo');
  }
  for (const f of plan.files) {
    if (f.action === 'no-op') {
      lines.push(`  ${f.path}: no legacy entries`);
    } else {
      lines.push(`  ${f.path}: ${f.legacyEntriesFound} legacy entries (${f.action})`);
      for (const e of f.legacyEntries) {
        const cmd = e.command.length > 80 ? `${e.command.slice(0, 80)}…` : e.command;
        lines.push(`    - ${e.event}: ${cmd}`);
      }
    }
  }
  lines.push('');
  if (plan.apply) {
    lines.push('Backups created: <file>.repo-harness-migrate-backup');
  } else {
    lines.push('Re-run with --apply to commit.');
  }
  return lines.join('\n');
}
