import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { hostConfigurationRoot, assertConfigurationPath } from '../../cli/installer/configuration-ownership';
import {
  inspectGlobalContext, parseReportLanguageFlag, preflightGlobalContextRefresh, setReportingLanguage,
  type GlobalContextHost,
} from '../../cli/installer/global-context';
import { renderJsonObjectUpdate, requireDocumentationLanguage } from '../adoption/standard-plan';
import { readRepoHarnessRegistryStrictSnapshot, RepoHarnessRegistryStrictError } from '../repo-registry';
import type { OperatorWriteRoute } from './write-channel';
import { OperatorWriteRefusal } from './write-run';

export const OPERATOR_REPORT_LANGUAGE_PATH = '/api/v1/settings/report-language';
export const OPERATOR_REPORT_LANGUAGE_ROUTE = /^\/api\/v1\/settings\/report-language$/u;
export const OPERATOR_DOCUMENTATION_LANGUAGE_ROUTE = /^\/api\/v1\/repositories\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/documentation-language$/u;
const HOSTS: readonly GlobalContextHost[] = ['claude', 'codex'];
const SOURCE_ROOT = resolve(import.meta.dir, '../../..');

export function readReportingLanguage(env?: NodeJS.ProcessEnv) {
  const plan = preflightGlobalContextRefresh(SOURCE_ROOT, hostConfigurationRoot(env), HOSTS, undefined);
  return { hosts: plan.files.map((file, index) => ({
    host: HOSTS[index]!, state: file.state,
    preset: file.current === null ? null : inspectGlobalContext(file.current, SOURCE_ROOT).language?.preset ?? null,
  })) };
}

export function reportingLanguageWriteRoute(env?: NodeJS.ProcessEnv): OperatorWriteRoute {
  return {
    id: 'settings_report_language_write', path: OPERATOR_REPORT_LANGUAGE_ROUTE,
    decode(fields) {
      if (Object.keys(fields).length !== 1 || typeof fields.preset !== 'string') throw new Error('Expected only preset.');
      const preset = parseReportLanguageFlag(fields.preset);
      return {
        operation: 'settings_report_language', target: 'report_language', input: { preset },
        execute: async () => {
          const result = setReportingLanguage(hostConfigurationRoot(env), SOURCE_ROOT, HOSTS, preset);
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

function readDocumentationPolicy(repositoryId: string, env?: NodeJS.ProcessEnv) {
  let repos;
  try { repos = readRepoHarnessRegistryStrictSnapshot({ env }).repos; }
  catch (error) {
    if (!(error instanceof RepoHarnessRegistryStrictError)) throw error;
    throw new OperatorWriteRefusal(503, 'registry_unavailable', error.message, 'Repair the repository registry, then reload.');
  }
  const repo = repos.find(entry => entry.id === repositoryId);
  if (!repo) throw new OperatorWriteRefusal(404, 'repository_not_found', 'The repository is not registered.', 'Register the repository, then reload.');
  const path = join(repo.path, '.ai', 'harness', 'policy.json');
  try { assertConfigurationPath(path, repo.path); }
  catch (error) {
    throw new OperatorWriteRefusal(409, 'policy_path_refused', (error as Error).message, 'Replace the linked or non-file policy path with a regular file.');
  }
  let raw: string;
  try { raw = readFileSync(path, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    throw new OperatorWriteRefusal(409, 'policy_missing', 'The repository policy file is missing.', 'repo-harness init');
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
  return { path, raw, policy, documentation: (policy.documentation ?? {}) as Record<string, unknown> };
}

export function readDocumentationLanguage(repositoryId: string, env?: NodeJS.ProcessEnv) {
  const { documentation } = readDocumentationPolicy(repositoryId, env);
  if (!Object.hasOwn(documentation, 'language')) return { language: null };
  try { return { language: requireDocumentationLanguage(documentation.language) }; }
  catch (error) {
    throw new OperatorWriteRefusal(409, 'policy_invalid', (error as Error).message, 'Fix documentation.language in .ai/harness/policy.json, then reload.');
  }
}

export function documentationLanguageWriteRoute(env?: NodeJS.ProcessEnv): OperatorWriteRoute {
  return {
    id: 'repository_documentation_language_write', path: OPERATOR_DOCUMENTATION_LANGUAGE_ROUTE,
    decode(fields, params) {
      if (Object.keys(fields).length !== 1 || !Object.hasOwn(fields, 'language')) throw new Error('Expected only language.');
      const language = requireDocumentationLanguage(fields.language);
      const repositoryId = params[0]!;
      return {
        operation: 'repository_documentation_language', target: `documentation_language:${repositoryId}`, input: { language },
        execute: async () => {
          const { path, raw, policy, documentation } = readDocumentationPolicy(repositoryId, env);
          const next = renderJsonObjectUpdate(raw, { ...policy, documentation: { ...documentation, language } });
          if (next !== raw) writeFileSync(path, next, 'utf8');
          return { status: 200, body: { language } };
        },
      };
    },
  };
}
