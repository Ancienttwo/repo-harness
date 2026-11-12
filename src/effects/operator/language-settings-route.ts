import { randomUUID } from 'node:crypto';
import { retryWindowsSharingRace } from '../atomic-append';
import { closeSync, constants, fchmodSync, fstatSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { JsonValue } from '../../core/evidence/types';
import { renderJsonObjectUpdate, requireDocumentationLanguage } from '../adoption/standard-plan';
import { readRepoHarnessRegistryStrictSnapshot, RepoHarnessRegistryStrictError } from '../repo-registry';
import type { OperatorWriteRoute } from './write-channel';
import { OperatorWriteRefusal } from './write-run';

export const OPERATOR_REPORT_LANGUAGE_PATH = '/api/v1/settings/report-language';
export const OPERATOR_REPORT_LANGUAGE_ROUTE = /^\/api\/v1\/settings\/report-language$/u;
export const OPERATOR_DOCUMENTATION_LANGUAGE_ROUTE = /^\/api\/v1\/repositories\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/documentation-language$/u;
export type OperatorReportingPreset = 'follow' | 'zh-CN' | 'en';

/** CLI composition owns installer dependencies; the HTTP effect owns transport. */
export interface OperatorLanguageSettingsAdapter {
  readReportingLanguage(): JsonValue;
  parseReportingPreset(value: string): OperatorReportingPreset;
  setReportingLanguage(preset: OperatorReportingPreset): {
    readonly status: 'ok' | 'skipped' | 'failed'; readonly detail: string; readonly changed_hosts: readonly string[];
  };
  assertPolicyPath(path: string, root: string): void;
}

export function requireLanguageSettings(adapter?: OperatorLanguageSettingsAdapter): OperatorLanguageSettingsAdapter {
  if (!adapter) throw new OperatorWriteRefusal(503, 'language_settings_unavailable', 'Language settings are not configured.', 'Start the console with repo-harness operator serve.');
  return adapter;
}

export function reportingLanguageWriteRoute(adapter?: OperatorLanguageSettingsAdapter): OperatorWriteRoute {
  return {
    id: 'settings_report_language_write', path: OPERATOR_REPORT_LANGUAGE_ROUTE,
    decode(fields) {
      if (Object.keys(fields).length !== 1 || typeof fields.preset !== 'string') throw new Error('Expected only preset.');
      // Adapter availability is checked in execute, so it cannot become invalid_body.
      const preset = adapter?.parseReportingPreset(fields.preset);
      return {
        operation: 'settings_report_language', target: 'report_language', input: { preset: fields.preset },
        execute: async () => {
          const result = requireLanguageSettings(adapter).setReportingLanguage(preset!);
          if (result.status === 'skipped') throw new OperatorWriteRefusal(409, 'report_language_refused', result.detail,
            'Repair the reported rules file or path, then save the reporting language again.');
          // Apply can fail after one host changed. The write run must mark this
          // outcome uncertain, rather than record a no-write refusal.
          if (result.status === 'failed') throw new Error(result.detail);
          return { status: 200, body: { changed_hosts: [...result.changed_hosts] } };
        },
      };
    },
  };
}

function readDocumentationPolicy(repositoryId: string, env: NodeJS.ProcessEnv | undefined, adapter: OperatorLanguageSettingsAdapter | undefined) {
  let repos;
  try { repos = readRepoHarnessRegistryStrictSnapshot({ env }).repos; }
  catch (error) {
    if (!(error instanceof RepoHarnessRegistryStrictError)) throw error;
    throw new OperatorWriteRefusal(503, 'registry_unavailable', error.message, 'Repair the repository registry, then reload.');
  }
  const repo = repos.find(entry => entry.id === repositoryId);
  if (!repo) throw new OperatorWriteRefusal(404, 'repository_not_found', 'The repository is not registered.', 'Register the repository, then reload.');
  const path = join(repo.path, '.ai', 'harness', 'policy.json');
  const settings = requireLanguageSettings(adapter);
  try { settings.assertPolicyPath(path, repo.path); }
  catch (error) {
    throw new OperatorWriteRefusal(409, 'policy_path_refused', (error as Error).message, 'Replace the linked or non-file policy path with a regular file.');
  }
  let raw: string;
  let mode: number;
  try {
    const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0));
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile()) throw new Error('Policy must be a regular file.');
      mode = stat.mode & 0o7777;
      raw = readFileSync(fd, 'utf8');
    } finally { closeSync(fd); }
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new OperatorWriteRefusal(409, 'policy_missing', 'The repository policy file is missing.', 'repo-harness init');
    }
    throw new OperatorWriteRefusal(409, 'policy_unreadable', 'The repository policy file cannot be read.', 'Make .ai/harness/policy.json a readable regular file, then retry.');
  }
  let policy: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Policy must be an object.');
    policy = parsed as Record<string, unknown>;
    if (policy.documentation !== undefined && (policy.documentation === null || typeof policy.documentation !== 'object' || Array.isArray(policy.documentation))) {
      throw new Error('documentation must be an object.');
    }
  } catch (error) {
    throw new OperatorWriteRefusal(409, 'policy_invalid', (error as Error).message, 'Fix .ai/harness/policy.json, then reload.');
  }
  return { path, raw, mode, policy, documentation: (policy.documentation ?? {}) as Record<string, unknown> };
}

export function readDocumentationLanguage(repositoryId: string, env?: NodeJS.ProcessEnv, adapter?: OperatorLanguageSettingsAdapter) {
  const { documentation } = readDocumentationPolicy(repositoryId, env, adapter);
  if (!Object.hasOwn(documentation, 'language')) return { language: null };
  try { return { language: requireDocumentationLanguage(documentation.language) }; }
  catch (error) {
    throw new OperatorWriteRefusal(409, 'policy_invalid', (error as Error).message, 'Fix documentation.language in .ai/harness/policy.json, then reload.');
  }
}

export function documentationLanguageWriteRoute(env?: NodeJS.ProcessEnv, adapter?: OperatorLanguageSettingsAdapter): OperatorWriteRoute {
  return {
    id: 'repository_documentation_language_write', path: OPERATOR_DOCUMENTATION_LANGUAGE_ROUTE,
    decode(fields, params) {
      if (Object.keys(fields).length !== 1 || !Object.hasOwn(fields, 'language')) throw new Error('Expected only language.');
      const language = requireDocumentationLanguage(fields.language);
      const repositoryId = params[0]!;
      return {
        operation: 'repository_documentation_language', target: `documentation_language:${repositoryId}`, input: { language },
        execute: async () => {
          const { path, raw, mode, policy, documentation } = readDocumentationPolicy(repositoryId, env, adapter);
          const next = renderJsonObjectUpdate(raw, { ...policy, documentation: { ...documentation, language } });
          if (next !== raw) {
            const temporary = join(dirname(path), `.policy-${randomUUID()}.tmp`);
            const fd = openSync(temporary, 'wx', mode);
            try {
              try {
                writeFileSync(fd, next, 'utf8');
                fchmodSync(fd, mode);
              } finally { closeSync(fd); }
              retryWindowsSharingRace(() => renameSync(temporary, path));
            } catch (error) {
              rmSync(temporary, { force: true });
              throw error;
            }
          }
          return { status: 200, body: { language } };
        },
      };
    },
  };
}
