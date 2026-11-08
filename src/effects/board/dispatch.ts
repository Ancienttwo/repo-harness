import { spawnSync } from 'child_process';
import { planDispatch, type DispatchDecisionV1, type DispatchPlanV1 } from '../../core/board/dispatch';
import type { BoardHostPortsV1 } from '../../core/board/board';
import { seatAccountQuotas } from '../../core/board/seat-routing';
import type { SeatId } from '../../core/board/seats-settings';
import { herdrAppDo } from '../terminal/herdr-core';
import { runHelper } from '../runtime/helper-runner';
import { readQuotaReport } from './quota';
import { readSeatsConfiguration } from './seats-configuration';
import { BoardCollectError, readParent, readRepositoryId } from './collect';

const GH_TIMEOUT_MS = 30_000;

type DispatchedV1 = Extract<DispatchDecisionV1, { action: 'dispatch' }>;

/** What `seatLaunch` (the `seats argv` command) answers for one seat; the command layer owns it, so the caller passes it in. */
export type DispatchLaunch = (seat: SeatId, labels: { readonly repositoryId: string; readonly issue: string; readonly parent: string }, cwd: string) =>
  Promise<{ readonly argv: readonly string[]; readonly tab: string | null }>;

export interface DispatchInput {
  readonly repo_root: string;
  readonly parent: number;
  /** The Herdr space that receives the worker tabs. */
  readonly space: string;
  readonly host: BoardHostPortsV1;
  readonly launch: DispatchLaunch;
  /** Plan only: no worktree, no claim, no seat. */
  readonly dry_run: boolean;
}

export interface DispatchResultV1 {
  readonly plan: DispatchPlanV1;
  readonly started: readonly { readonly issue: number; readonly seat: SeatId; readonly worktree: string; readonly claim_url: string }[];
}

function gh(input: DispatchInput, args: readonly string[], stdin?: string): string {
  const run = spawnSync(process.env.REPO_HARNESS_GH_BIN ?? 'gh', [...args], {
    cwd: input.repo_root, env: { ...process.env, GH_HOST: 'github.com' }, encoding: 'utf-8', input: stdin, timeout: GH_TIMEOUT_MS, killSignal: 'SIGKILL',
  });
  if (run.error !== undefined || run.status !== 0) throw new BoardCollectError(`gh ${args.slice(0, 2).join(' ')} failed: ${(run.stderr || run.error?.message || '').trim().slice(0, 300)}`);
  return run.stdout.trim();
}

function startWorktree(input: DispatchInput, issue: number): { readonly path: string; readonly branch: string } {
  const run = runHelper({ helper: 'contract-worktree', args: ['start', '--issue', String(issue), '--json'], cwd: input.repo_root, stdio: 'pipe' });
  if (run.exitCode !== 0) throw new BoardCollectError(`contract-worktree start for #${issue} failed: ${(run.stderr ?? '').trim().slice(0, 300)}`);
  const start = JSON.parse(run.stdout ?? '') as { kind?: unknown; worktree_path?: unknown; branch?: unknown; disposition?: unknown };
  if (start.kind !== 'repo-harness-contract-worktree-start' || typeof start.worktree_path !== 'string' || typeof start.branch !== 'string') {
    throw new BoardCollectError(`contract-worktree start for #${issue} answered an unknown document`);
  }
  // Dispatch runs in the primary checkout. A linked worktree would answer with itself.
  if (start.disposition === 'already_linked') throw new BoardCollectError('dispatch must run in the primary checkout, not in a linked worktree');
  return { path: start.worktree_path, branch: start.branch };
}

function claimBody(decision: DispatchedV1, branch: string, tab: string | null): string {
  return [
    'repo-harness issue claim',
    'Status: active',
    'Role: writer',
    `Agent: ${decision.seat}, session ${tab ?? 'unnamed tab'}`,
    `Branch: ${branch}`,
    `Scope: issue #${decision.issue} as its body states it`,
    'Not in scope: anything the issue body does not name',
    `Dispatch reading: ${decision.route_line}`,
  ].join('\n');
}

function packet(decision: DispatchedV1, worktree: string, claimUrl: string): string {
  return `Task: issue #${decision.issue} (${decision.title}). Worktree: ${worktree}. Claim: ${claimUrl}. Read the issue body and every comment first: gh issue view ${decision.issue} --comments. Work as the writer of repo-harness-issue-flow and report to the orchestrator when done.`;
}

/**
 * Plan the dispatch of one parent and, unless `dry_run`, start each ready issue in order: worktree, claim comment, seat tab.
 * The seat labels itself before its agent starts (`seats argv`). A failed launch releases the claim and stops the run.
 */
export async function runDispatch(input: DispatchInput): Promise<DispatchResultV1> {
  const { parent } = readParent(input);
  const repositoryId = String(readRepositoryId(input));
  const terminals = input.host.seatTerminals(repositoryId);
  if (terminals.status === 'unavailable') throw new BoardCollectError(`hc could not list the seat terminals: ${terminals.reason}`);
  const { seats } = readSeatsConfiguration(process.env);
  const quota = seatAccountQuotas((await readQuotaReport(process.env)).accounts, seats.routing);
  const plan = planDispatch({ parent, terminals: terminals.terminals, seats, quota });
  const started: Array<DispatchResultV1['started'][number]> = [];
  if (input.dry_run) return { plan, started };
  for (const decision of plan.decisions) {
    if (decision.action !== 'dispatch') continue;
    const worktree = startWorktree(input, decision.issue);
    const labels = { repositoryId, issue: String(decision.issue), parent: String(input.parent) };
    const launch = await input.launch(decision.seat, labels, worktree.path);
    const claimUrl = gh(input, ['issue', 'comment', String(decision.issue), '--body-file', '-'], claimBody(decision, worktree.branch, launch.tab));
    try {
      herdrAppDo('tab.new', {
        ...(launch.tab === null ? {} : { name: launch.tab }), space: input.space, folder: worktree.path, argv: launch.argv, task: packet(decision, worktree.path, claimUrl),
      });
    } catch (error) {
      gh(input, ['issue', 'comment', String(decision.issue), '--body-file', '-'], `repo-harness issue claim status\nClaim: ${claimUrl}\nStatus: released`);
      throw error;
    }
    started.push({ issue: decision.issue, seat: decision.seat, worktree: worktree.path, claim_url: claimUrl });
  }
  return { plan, started };
}
