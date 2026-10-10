import { createHash } from 'crypto';
import { closeSync, constants, existsSync, fstatSync, openSync, readFileSync } from 'fs';
import { join } from 'path';
import { canonicalize } from '../../core/evidence/canonical-json';
import type { JsonValue } from '../../core/evidence/types';
import { runProcess } from '../process-runner';
import { configuredGitBinary } from '../git/common-directory';
import { assertTaskRequest, processProofAlive, readSessionArtifact, readTaskAgent, readTaskRequestResult, type TaskRequest } from './task-session';

// These values come from JSON artifacts (or null), not from model output objects.
const digest = (value: unknown) => `sha256:${createHash('sha256').update(canonicalize(value as JsonValue)).digest('hex')}`;

function contextDigest(path: string): string {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 10 * 1024 * 1024) throw new Error('task_agent_context_too_large');
    return `sha256:${createHash('sha256').update(readFileSync(fd)).digest('hex')}`;
  }
  finally { closeSync(fd); }
}

function head(root: string): string {
  const result = runProcess(configuredGitBinary(), ['rev-parse', '--verify', 'HEAD'], { cwd: root, timeoutMs: 5000, stdio: 'pipe' });
  const sha = result.stdout.trim();
  if (result.status !== 0 || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(sha)) throw new Error('task_agent_head_unavailable');
  return sha;
}

/** Observation only. Never deliver, ingest, accept, approve or repair evidence. */
export function reconcileTaskRequest(repoRoot: string, task: string, role: string, requestId: string, expectedHead: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) throw new Error('task_agent_request_id_invalid');
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(expectedHead)) throw new Error('task_agent_expected_head_invalid');
  const { dir, binding } = readTaskAgent(repoRoot, task, role);
  if (head(binding.execution_root) !== expectedHead) throw new Error('task_agent_head_stale');
  const matches: Array<{ request: TaskRequest; path: string }> = [];
  for (let round = 1; round <= binding.max_requests; round++) {
    const path = join(dir, `request-${round}.json`);
    if (!existsSync(path)) continue;
    const request = readSessionArtifact<TaskRequest>(path);
    if (request.request_id !== requestId) continue;
    if (request.task !== task || request.role !== role || request.round !== round) throw new Error('task_agent_request_identity_mismatch');
    assertTaskRequest(repoRoot, dir, request);
    matches.push({ request, path });
  }
  if (matches.length !== 1) throw new Error(matches.length ? 'task_agent_request_id_conflict' : 'task_agent_request_not_found');
  const { request, path } = matches[0]!;
  if (contextDigest(request.context_ref) !== request.context_sha256) throw new Error('task_agent_context_identity_mismatch');
  const deliveryPath = join(dir, `delivery-${request.round}.json`);
  const delivery = existsSync(deliveryPath) ? readSessionArtifact<{ request_id: string; state: string }>(deliveryPath) : null;
  if (delivery && (delivery.request_id !== requestId || !['accepted', 'unknown'].includes(delivery.state))) throw new Error('task_agent_delivery_identity_mismatch');
  const result = readTaskRequestResult(repoRoot, dir, request);
  let provider: 'alive' | 'exited' | 'identity_unavailable';
  try { provider = processProofAlive(binding.provider) ? 'alive' : 'exited'; }
  catch { provider = 'identity_unavailable'; }
  // Recheck the source identities. This is a stable observation, not an atomic
  // filesystem snapshot or a statement that the result was produced at HEAD.
  const currentBinding = readTaskAgent(repoRoot, task, role).binding;
  if (digest(currentBinding) !== digest(binding) || digest(readSessionArtifact(path)) !== digest(request)
    || digest(readTaskRequestResult(repoRoot, dir, request)) !== digest(result)
    || digest(existsSync(deliveryPath) ? readSessionArtifact(deliveryPath) : null) !== digest(delivery)
    || contextDigest(request.context_ref) !== request.context_sha256) throw new Error('task_agent_readback_changed');
  if (head(binding.execution_root) !== expectedHead) throw new Error('task_agent_head_stale');
  return {
    protocol: 1 as const, kind: 'repo-harness-task-request-readback' as const,
    authority: 'execution-observation' as const, acceptance_authorized: false as const,
    task, role, request_id: requestId, round: request.round,
    observed_head_sha: expectedHead, result_head_binding: 'unverified' as const,
    delivery: delivery?.state ?? 'unknown', provider,
    result_status: binding.host ? 'host_authority' : result ? 'available' : 'pending', result,
    evidence: {
      hash_encoding: 'canonical-json' as const,
      request: { ref: path, sha256: digest(request) },
      context: { ref: request.context_ref, sha256: request.context_sha256, hash_encoding: 'raw-bytes' as const },
      delivery: delivery ? { ref: deliveryPath, sha256: digest(delivery) } : null,
      result: result ? { ref: request.result_ref, sha256: digest(result) } : null,
    },
  };
}
