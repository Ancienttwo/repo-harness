// The resident board facts child of `operator serve` (#2155 D1). The board
// collector runs gh, git, hc and archctx synchronously, so it runs here and
// never in the server event loop. The board observer supervises this process:
// it sends one request line, waits for the one answer line, and kills the
// process group at the request deadline. A new process starts with empty
// keyed source stores.
//
// This file is the composition root that passes the hc host ports to the
// collector (Surface contract, docs/adr/ADR-0002 rule 5).

import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { BoardSourceError } from '../../core/board/source';
import type { BoardParentsReadFailure, BoardReadFailure } from '../../core/operator/board-read';
import { BoardCollectError, collectBoardThrough } from '../board/collect';
import { createKeyedSources, type KeyedSources } from '../board/keyed-sources';
import { BoardParentsError, collectBoardParents } from '../board/parents';
import { boardHostPorts } from '../terminal/herdr-core';

export type BoardWorkerQuery =
  | { readonly kind: 'parents'; readonly repo_root: string }
  | { readonly kind: 'board'; readonly repo_root: string; readonly parent: number; readonly key: string }
  | { readonly kind: 'rate_limit' }
  /** The end of a cycle: the stores of the boards that the cycle did not read are removed. */
  | { readonly kind: 'retain'; readonly keys: readonly string[] };
/** The id binds the one answer line to its request. */
export type BoardWorkerRequest = BoardWorkerQuery & { readonly id: number };

export type BoardWorkerFailure = BoardReadFailure | BoardParentsReadFailure | 'rate_limit_unavailable';
export type BoardWorkerAnswer =
  | { readonly id: number; readonly ok: true; readonly value: unknown }
  | { readonly id: number; readonly ok: false; readonly code: BoardWorkerFailure };

/** The lowest share of the GitHub REST and GraphQL budgets that remains. */
export interface GitHubRateLimit { readonly remaining: number; readonly limit: number }

function boardFailure(error: unknown): BoardReadFailure {
  if (error instanceof BoardCollectError) return 'board_collect_failed';
  return error instanceof BoardSourceError ? 'board_source_invalid' : 'board_unavailable';
}

function parentsFailure(error: unknown): BoardParentsReadFailure {
  if (error instanceof BoardSourceError) return 'parents_source_invalid';
  return error instanceof BoardParentsError ? error.code : 'parents_unavailable';
}

/** `gh api rate_limit` costs no budget. The lower remaining share of REST and GraphQL sets the cycle gap. */
function readRateLimit(): GitHubRateLimit {
  const result = spawnSync(process.env.REPO_HARNESS_GH_BIN ?? 'gh', ['api', 'rate_limit', '--hostname', 'github.com'], {
    env: { ...process.env, GH_HOST: 'github.com' }, encoding: 'utf-8', timeout: 30_000, killSignal: 'SIGKILL',
  });
  if (result.status !== 0) throw new Error('rate limit read failed');
  const resources = (JSON.parse(result.stdout) as { resources?: Record<string, { remaining?: unknown; limit?: unknown }> }).resources;
  const budgets = [resources?.core, resources?.graphql].map(budget => ({ remaining: budget?.remaining, limit: budget?.limit }));
  if (budgets.some(budget => typeof budget.remaining !== 'number' || typeof budget.limit !== 'number' || budget.limit <= 0)) throw new Error('rate limit invalid');
  return (budgets as GitHubRateLimit[]).reduce((low, budget) => budget.remaining / budget.limit < low.remaining / low.limit ? budget : low);
}

export function answerBoardWorkerRequest(request: BoardWorkerRequest, stores: Map<string, KeyedSources>, host = boardHostPorts()): BoardWorkerAnswer {
  const { id } = request;
  switch (request.kind) {
    case 'parents':
      try { return { id, ok: true, value: collectBoardParents({ repo_root: request.repo_root, host }) }; }
      catch (error) { return { id, ok: false, code: parentsFailure(error) }; }
    case 'board': {
      let sources = stores.get(request.key);
      if (sources === undefined) { sources = createKeyedSources(); stores.set(request.key, sources); }
      try { return { id, ok: true, value: collectBoardThrough({ repo_root: request.repo_root, parent: request.parent, host }, sources) }; }
      catch (error) { return { id, ok: false, code: boardFailure(error) }; }
    }
    case 'rate_limit':
      try { return { id, ok: true, value: readRateLimit() }; }
      catch { return { id, ok: false, code: 'rate_limit_unavailable' }; }
    case 'retain': {
      const keep = new Set(request.keys);
      for (const key of stores.keys()) if (!keep.has(key)) stores.delete(key);
      return { id, ok: true, value: null };
    }
  }
}

if (import.meta.main) {
  const stores = new Map<string, KeyedSources>();
  const host = boardHostPorts();
  const reader = createInterface({ input: process.stdin, crlfDelay: Infinity });
  // The supervisor owns this process: a closed stdin means the server went away.
  reader.once('close', () => process.exit(0));
  reader.on('line', line => {
    const answer = answerBoardWorkerRequest(JSON.parse(line) as BoardWorkerRequest, stores, host);
    process.stdout.write(`${JSON.stringify(answer)}\n`);
  });
}
