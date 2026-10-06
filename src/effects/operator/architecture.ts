import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { ArchitectureModelReader } from '../architecture/model-reader';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';
import { ModuleReadError } from '../../core/review/module-review-prompt';
import { SECRET_TOKEN_PATTERNS, containsSecret } from '../../core/security/secret-patterns';
import { ARCHITECTURE_FAILURES, decodeArchitectureModuleIndex, decodeArchitectureModuleDetail, decodeArchitectureReviewPrompt, isArchitectureRequest, type ArchitectureRequest } from '../../core/operator/architecture';

const PRIVATE_PATH = /(?<![A-Za-z0-9])(?:\/(?:Users|home|private|tmp|Volumes|var)\/|[A-Za-z]:[\\/])[^\s"'<>]+/g;

// Redact public text before the whitelist decoder. Never change a prompt digest.
function publicValue(value: unknown, root: string): unknown {
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
  const reader = new ArchitectureModelReader(repo.path);
  if (input.kind === 'architecture_modules') return decodeArchitectureModuleIndex(publicValue(reader.list(), reader.root));
  if (input.kind === 'architecture_module') return decodeArchitectureModuleDetail(publicValue(reader.detail(input.capability_id), reader.root));
  // Resolve only validated full SHAs. Missing commits have a distinct public failure.
  if (input.base !== undefined && input.head !== undefined) {
    try { reader.resolveCommit(input.base); reader.resolveCommit(input.head); }
    catch { throw new ModuleReadError('commit_not_found'); }
  }
  const packet = reader.reviewPrompt(input.capability_id, { shard: input.shard, base: input.base, head: input.head });
  const home = env?.HOME ?? process.env.HOME;
  if (containsSecret(packet.prompt) || packet.prompt.includes(reader.root) || (home && home.length > 1 && packet.prompt.includes(home))) throw new ModuleReadError('secret_detected');
  return decodeArchitectureReviewPrompt(packet);
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
