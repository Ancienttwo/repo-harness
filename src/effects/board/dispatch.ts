import { spawnSync } from 'child_process';
import { DispatchError, planDispatch, type DispatchDecisionV1, type DispatchPlanV1 } from '../../core/board/dispatch';
import type { BoardHostPortsV1 } from '../../core/board/board';
import { effectiveSeatConfig, seatAccountQuotas } from '../../core/board/seat-routing';
import { withSeatLine } from '../../core/board/seat-line';
import type { SeatConfigV1, SeatId } from '../../core/board/seats-settings';
import { HerdrCoreError, herdrAppDo } from '../terminal/herdr-core';
import { runHelper } from '../runtime/helper-runner';
import { readQuotaReport } from './quota';
import { readSeatsConfiguration } from './seats-configuration';
import { BoardCollectError, readParent, readRepositoryId } from './collect';

const GH_TIMEOUT_MS = 30_000;

type DispatchedV1 = Extract<DispatchDecisionV1, { action: 'dispatch' }>;

/** What `seatLaunch` (the `seats argv` command) answers for one seat; the command layer owns it, so the caller passes it in. */
export type DispatchLaunch = (seat: SeatId, labels: { readonly repositoryId: string; readonly issue: string; readonly parent: string }, cwd: string) =>
  Promise<{ readonly argv: readonly string[]; readonly tab: string | null; readonly runtime: SeatConfigV1['runtime'] }>;

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

/** The writes of one dispatch. Each is a process boundary, so tests replace them. */
export interface DispatchPorts {
  readonly startWorktree: (issue: number) => { readonly path: string; readonly branch: string };
  /** Posts an issue comment and returns its URL. */
  readonly comment: (issue: number, body: string) => string;
  /** `herdr-app do tab.new` with these arguments. */
  readonly openTab: (args: Readonly<Record<string, unknown>>) => void;
  readonly launch: DispatchLaunch;
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

function claimBody(decision: DispatchedV1, branch: string, tab: string | null, runtime: SeatConfigV1['runtime'], model: string | null, coordinator: string): string {
  return [
    'repo-harness issue claim',
    'Status: active',
    'Role: writer',
    `Agent: ${decision.seat}, session ${tab ?? 'unnamed tab'}`,
    `Runtime: ${runtime}`,
    ...(model === null ? [] : [`Model: ${model}`]),
    `Branch: ${branch}`,
    `Scope: issue #${decision.issue} as its body states it`,
    'Not in scope: anything the issue body does not name',
    `Coordinator: ${coordinator}`,
    `Dispatch reading: ${decision.route_line}`,
  ].join('\n');
}

function packet(decision: DispatchedV1, worktree: string, claimUrl: string): string {
  return `Task: issue #${decision.issue} (${decision.title}). Worktree: ${worktree}. Claim: ${claimUrl}. Read the issue body and every comment first: gh issue view ${decision.issue} --comments. Work as the writer of repo-harness-issue-flow and report to the orchestrator when done.`;
}

/** Failures that stop `tab.new` before it sends a request. Any other failure (a timeout, an unreadable answer) may follow a created tab. */
const NOT_SENT: ReadonlySet<string> = new Set(['missing', 'nested', 'invalid_labels', 'invalid_address']);

function releaseClaim(ports: DispatchPorts, issue: number, claimUrl: string): void {
  ports.comment(issue, `repo-harness issue claim status\nClaim: ${claimUrl}\nStatus: released`);
}

/**
 * Start each ready issue in plan order: worktree, claim comment, seat tab. The seat labels itself before its agent starts
 * (`seats argv`). A launch that failed before the request keeps no claim; one that may have created the tab keeps it and
 * stops, because a retry could start a second worker.
 */
export async function executeDispatch(plan: DispatchPlanV1, context: { readonly repositoryId: string; readonly parent: number; readonly space: string; readonly dry_run: boolean; readonly model: (seat: SeatId) => string | null }, ports: DispatchPorts): Promise<DispatchResultV1['started']> {
  const started: Array<DispatchResultV1['started'][number]> = [];
  if (plan.decisions.some(decision => decision.action === 'dispatch') && plan.coordinator === null) throw new DispatchError(`#${context.parent} has no active coordinator claim${plan.parent_comments_truncated ? ' in the comments that were read; older parent comments were not read' : ''}; nothing was started`);
  if (context.dry_run) return started;
  for (const decision of plan.decisions) {
    if (decision.action !== 'dispatch') continue;
    const worktree = ports.startWorktree(decision.issue);
    const labels = { repositoryId: context.repositoryId, issue: String(decision.issue), parent: String(context.parent) };
    const launch = await ports.launch(decision.seat, labels, worktree.path);
    // The launch reads the seats configuration again, so the runtime that will run is checked here, not the planned one.
    if (decision.credentials && launch.runtime === 'pi') throw new DispatchError(`#${decision.issue} touches credentials and its launch resolved to a Pi seat; nothing was started`);
    const claimUrl = ports.comment(decision.issue, claimBody(decision, worktree.branch, launch.tab, launch.runtime, context.model(decision.seat), plan.coordinator!));
    try {
      ports.openTab({
        ...(launch.tab === null ? {} : { name: launch.tab }), space: context.space, folder: worktree.path, argv: launch.argv, task: packet(decision, worktree.path, claimUrl),
      });
    } catch (error) {
      if (error instanceof HerdrCoreError && NOT_SENT.has(error.reason)) {
        releaseClaim(ports, decision.issue, claimUrl);
        throw error;
      }
      throw new DispatchError(`launch_unknown for #${decision.issue}: ${(error as Error).message}. The claim ${claimUrl} stays; check hc ls for the tab before a retry`);
    }
    started.push({ issue: decision.issue, seat: decision.seat, worktree: worktree.path, claim_url: claimUrl });
  }
  return started;
}

/** Plan the dispatch of one parent and, unless `dry_run`, execute it. */
export async function runDispatch(input: DispatchInput): Promise<DispatchResultV1> {
  const { parent } = readParent(input);
  const repositoryId = String(readRepositoryId(input));
  const terminals = input.host.seatTerminals(repositoryId);
  if (terminals.status === 'unavailable') throw new BoardCollectError(`hc could not list the seat terminals: ${terminals.reason}`);
  const { seats } = readSeatsConfiguration(process.env);
  const quota = seatAccountQuotas((await readQuotaReport(process.env)).accounts, seats.routing);
  const plan = planDispatch({ parent, terminals: terminals.terminals, seats, quota });
  const started = await executeDispatch(plan, { repositoryId, parent: input.parent, space: input.space, dry_run: input.dry_run,
    // The same projection that `seatLaunch` uses for the argv, so the claim names the model that runs.
    model: seat => effectiveSeatConfig(seat, seats, quota)?.model ?? null,
  }, {
    startWorktree: issue => startWorktree(input, issue),
    comment: (issue, body) => gh(input, ['issue', 'comment', String(issue), '--body-file', '-'], withSeatLine(body)),
    openTab: args => { herdrAppDo('tab.new', args); },
    launch: input.launch,
  });
  return { plan, started };
}
