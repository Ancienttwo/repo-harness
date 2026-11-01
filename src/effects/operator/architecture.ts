import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { ArchitectureModelReader } from '../architecture/model-reader';
import { readArchitectureHistory } from '../architecture/archctx-provider';
import { ArchctxClientError } from '../../core/architecture/projection';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';
import { ModuleReadError } from '../../core/architecture/module-view';
import { SECRET_TOKEN_PATTERNS, containsSecret } from '../../core/security/secret-patterns';
import { ARCHITECTURE_FAILURES, decodeArchitectureModuleIndex, decodeArchitectureModuleDetail, decodeArchitectureReviewPrompt, isArchitectureRequest, type ArchitectureRequest } from '../../core/operator/architecture';

const PRIVATE_PATH = /(?<![A-Za-z0-9])(?:\/(?:Users|home|private|tmp|Volumes|var)\/|[A-Za-z]:[\\/])[^\s"'<>]+/g;

// Redact public text before the whitelist decoder. Never change a prompt digest.
export function publicValue(value: unknown, root: string): unknown {
  if (typeof value === 'string') {
    let text = value.replaceAll(root, '[redacted]').replace(new RegExp(PRIVATE_PATH.source, PRIVATE_PATH.flags), '[redacted]');
    for (const { pattern } of SECRET_TOKEN_PATTERNS) text = text.replace(new RegExp(pattern.source, pattern.flags), '[redacted]');
    return containsSecret(text) ? '[redacted]' : text;
  }
  if (Array.isArray(value)) return value.map(item => publicValue(item, root));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, publicValue(item, root)]));
  return value;
}
export function readArchitecture(input: ArchitectureRequest, env?: NodeJS.ProcessEnv): unknown {
  if (!isArchitectureRequest(input)) throw new ModuleReadError('invalid_request');
  let registry;
  try { registry = readRepoHarnessRegistryStrictSnapshot({ env }); }
  catch { throw new ModuleReadError('unavailable'); }
  const repo = registry.repos.find(repo => repo.id === input.repository_id);
  if (!repo) throw new ModuleReadError('repository_not_found');
  if (input.kind === 'architecture_history') return publicValue(readHistory(repo.path, input, env), repo.path);
  const reader = new ArchitectureModelReader(repo.path);
  if (input.kind === 'architecture_modules') return decodeArchitectureModuleIndex(publicValue(reader.list(), reader.root));
  if (input.kind === 'architecture_module') return decodeArchitectureModuleDetail(publicValue(reader.detail(input.capability_id), reader.root));
  // Resolve only validated full SHAs. Missing commits have a distinct public failure.
  if (input.base !== undefined && input.head !== undefined) {
    try { reader.resolveCommit(input.base); reader.resolveCommit(input.head); }
    catch { throw new ModuleReadError('commit_not_found'); }
  }
  // GET routes run no probe: no projection check and no docs anchors, so generated_summary stays unknown.
  // Diff mode still needs `archctx resolve`, because ArchContext owns path ownership.
  const packet = reader.reviewPrompt(input.capability_id, { shard: input.shard, base: input.base, head: input.head, archctx: { env: env ?? process.env } });
  const home = env?.HOME ?? process.env.HOME;
  if (containsSecret(packet.prompt) || packet.prompt.includes(reader.root) || (home && home.length > 1 && packet.prompt.includes(home))) throw new ModuleReadError('secret_detected');
  return decodeArchitectureReviewPrompt(packet);
}

/** The public code for an archctx history failure. archctx decides each failure; this only names it. */
function readHistory(root: string, input: Extract<ArchitectureRequest, { kind: 'architecture_history' }>, env?: NodeJS.ProcessEnv): unknown {
  try { return readArchitectureHistory(root, input, { env: env ?? process.env }); }
  catch (error) {
    if (!(error instanceof ArchctxClientError)) throw error;
    if (error.reasonCode === 'history-shallow-repository') throw new ModuleReadError('history_shallow_repository');
    if (error.reasonCode === 'native-context-ref-unavailable') throw new ModuleReadError('commit_not_found');
    if (error.code === 'RH_ARCHCTX_TIMEOUT') throw new ModuleReadError('timeout');
    throw error;
  }
}

if (!isMainThread && parentPort) {
  try {
    const { request, env } = workerData;
    parentPort.postMessage({ ok: true, snapshot: readArchitecture(request, env) });
  } catch (error) {
    const code = error instanceof ModuleReadError && ARCHITECTURE_FAILURES.includes(error.code as typeof ARCHITECTURE_FAILURES[number]) ? error.code : 'unavailable';
    parentPort.postMessage({ ok: false, code });
  }
}
