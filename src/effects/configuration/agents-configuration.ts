import { closeSync, constants, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

import {
  EMPTY_AGENTS_CONFIG,
  decodeAgentsConfig,
  type AgentsConfigV1,
  type AgentsSettingsRequestV1,
  type AgentsSettingsResultV1,
} from '../../core/operator/agents-settings';
import { isReviewRuntimeId } from '../../core/review/review-runtimes';
import { syncDirectoryDurably } from '../atomic-append';
import { globalConfigurationRevision, readGlobalConfiguration } from './global-configuration';

/**
 * The `agents` section of the host configuration document (G9). The CLI and
 * the operator write route share `applyAgentsSettings`; the caller holds the
 * config lock.
 */

export type AgentsConfigurationErrorCode =
  | 'config_invalid'
  | 'revision_conflict'
  | 'runtime_unknown'
  | 'runtime_not_enabled'
  | 'use_not_supported'
  | 'default_docs_invalid';

export class AgentsConfigurationError extends Error {
  constructor(readonly code: AgentsConfigurationErrorCode, message: string) {
    super(message);
    this.name = 'AgentsConfigurationError';
  }
}

export interface AgentsConfiguration {
  readonly revision: string;
  readonly agents: AgentsConfigV1;
}

export function readAgentsConfiguration(env: NodeJS.ProcessEnv = process.env): AgentsConfiguration {
  let document: ReturnType<typeof readGlobalConfiguration>;
  try {
    document = readGlobalConfiguration(env);
  } catch {
    throw new AgentsConfigurationError('config_invalid', 'The repo-harness configuration file is not a valid JSON object.');
  }
  return { revision: document.revision, agents: sectionOf(document.config) };
}

function sectionOf(config: Record<string, unknown>): AgentsConfigV1 {
  if (config.agents === undefined) return EMPTY_AGENTS_CONFIG;
  try {
    return decodeAgentsConfig(config.agents);
  } catch {
    throw new AgentsConfigurationError('config_invalid', 'The agents section of the repo-harness configuration is not valid.');
  }
}

const sorted = (ids: Iterable<string>): string[] => [...ids].sort();
const sameList = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((id, index) => id === right[index]);

function nextSection(current: AgentsConfigV1, request: AgentsSettingsRequestV1, knownRuntimes: ReadonlySet<string>): AgentsConfigV1 {
  const enabled = new Set(current.enabled);
  const docs = new Set(current.uses.docs);
  const review = new Set(current.uses.review);
  for (const change of request.changes) {
    if (!knownRuntimes.has(change.runtime)) {
      throw new AgentsConfigurationError('runtime_unknown', `Runtime ${change.runtime} is not in the runtime registry.`);
    }
    if (!change.enabled && change.uses.length > 0) {
      throw new AgentsConfigurationError('runtime_not_enabled', `Runtime ${change.runtime} must be enabled to have a use.`);
    }
    if (change.uses.includes('review') && !isReviewRuntimeId(change.runtime)) {
      throw new AgentsConfigurationError('use_not_supported', `Runtime ${change.runtime} cannot review; only claude and codex can.`);
    }
    if (change.enabled) enabled.add(change.runtime);
    else enabled.delete(change.runtime);
    for (const [use, set] of [['docs', docs], ['review', review]] as const) {
      if (change.uses.includes(use)) set.add(change.runtime);
      else set.delete(change.runtime);
    }
  }
  const defaultDocs = request.default_docs_runtime === undefined ? current.default_docs : request.default_docs_runtime;
  if (defaultDocs !== null && !docs.has(defaultDocs)) {
    throw new AgentsConfigurationError('default_docs_invalid', 'The default docs runtime must be enabled for docs. Choose another default or clear it.');
  }
  return { enabled: sorted(enabled), uses: { docs: sorted(docs), review: sorted(review) }, default_docs: defaultDocs };
}

function changedKeys(current: AgentsConfigV1, next: AgentsConfigV1): string[] {
  return [
    ...(sameList(current.enabled, next.enabled) ? [] : ['agents.enabled']),
    ...(sameList(current.uses.docs, next.uses.docs) ? [] : ['agents.uses.docs']),
    ...(sameList(current.uses.review, next.uses.review) ? [] : ['agents.uses.review']),
    ...(current.default_docs === next.default_docs ? [] : ['agents.default_docs']),
  ];
}

function revisionOnDisk(path: string): string {
  try {
    return globalConfigurationRevision(readFileSync(path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'absent';
    throw error;
  }
}

/**
 * Replace the file only while it still has the revision the request read, so
 * another writer's change is never overwritten. A symlinked file is refused:
 * the rename would replace the link, not its target.
 */
function replaceConfiguration(path: string, expectedRevision: string, bytes: Buffer): void {
  const directory = dirname(path);
  const created = mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (created !== undefined) syncDirectoryDurably(dirname(directory));
  try {
    if (!lstatSync(path).isFile()) throw new AgentsConfigurationError('config_invalid', 'The repo-harness configuration file must be a regular file, not a link.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  const fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  try {
    try {
      if (writeSync(fd, bytes) !== bytes.byteLength) throw new Error('configuration was only partly written');
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    if (revisionOnDisk(path) !== expectedRevision) {
      throw new AgentsConfigurationError('revision_conflict', 'The configuration changed after it was read.');
    }
    renameSync(temporary, path);
    syncDirectoryDurably(directory);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function applyAgentsSettings(
  request: AgentsSettingsRequestV1,
  knownRuntimes: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): AgentsSettingsResultV1 {
  let document: ReturnType<typeof readGlobalConfiguration>;
  try {
    document = readGlobalConfiguration(env);
  } catch {
    throw new AgentsConfigurationError('config_invalid', 'The repo-harness configuration file is not a valid JSON object.');
  }
  if (document.revision !== request.expected_revision) {
    throw new AgentsConfigurationError('revision_conflict', 'The configuration changed after it was read.');
  }
  const current = sectionOf(document.config);
  const next = nextSection(current, request, new Set(knownRuntimes));
  const changed = changedKeys(current, next);
  if (changed.length === 0) return { config_revision: document.revision, changed_keys: [] };
  const bytes = Buffer.from(`${JSON.stringify({ ...document.config, agents: next }, null, 2)}\n`, 'utf8');
  replaceConfiguration(document.path, document.revision, bytes);
  return { config_revision: globalConfigurationRevision(bytes), changed_keys: changed };
}
