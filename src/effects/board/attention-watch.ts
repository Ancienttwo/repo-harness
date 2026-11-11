import { appendFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { evaluateBoardAttention } from '../../core/board/attention';
import { ADVISOR_CAP_SPAN_MS, WINDOW_WITH_WORKERS_MS, deliveryTiming, liveSeatTerminals, planAttentionDeliveries, type AttentionDeliveryV1, type AttentionHostPortsV1 } from '../../core/board/attention-delivery';
import type { BoardV1 } from '../../core/board/board';
import { repoHarnessHome } from '../repo-harness-home';
import { BoardCollectError, boardAvailabilityFailure } from './collect';
import type { ReviewObserver } from './review';

/**
 * The resident attention watcher (#1509). It runs in an hc terminal that
 * carries the service label and the repository and parent labels of its
 * board. Each window it reads the board once, runs the attention rules, sends
 * the findings to the seat terminals and appends every finding and every send
 * attempt to its log. A provider 5xx or a gh call that ends with no exit status
 * skips one window; other board read failures end the watcher, and doctor then
 * reports it stopped.
 */
export class AttentionWatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AttentionWatchError';
  }
}

export const attentionStartCommand = (parent: number): string => `repo-harness board attention start --parent ${parent}`;

export function attentionLogPath(repositoryId: number, parent: number, env: NodeJS.ProcessEnv = process.env): string {
  return join(repoHarnessHome(env), 'board', `attention-${repositoryId}-${parent}.jsonl`);
}

export type AttentionSendOutcome = 'sent' | 'send_failed' | 'skipped_blocked' | 'terminal_ended';

/** One log line. The log is append-only; the weekly threshold review reads it. */
export type AttentionLogRecordV1 = { readonly at: string; readonly window: string; readonly parent: number } & (
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'finding'; readonly rule: string; readonly route: string; readonly message: string }
  | { readonly kind: 'review'; readonly pr: number | null; readonly seat: string | null; readonly outcome: 'started' | 'refused'; readonly detail: string | null }
  | { readonly kind: 'skip'; readonly route: string; readonly reason: string }
  | { readonly kind: 'send'; readonly route: string; readonly terminal: string; readonly rules: readonly string[]; readonly outcome: AttentionSendOutcome; readonly detail: string | null }
);

function append(path: string, record: AttentionLogRecordV1): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  appendFileSync(path, `${JSON.stringify(record)}\n`, { mode: 0o600 });
}

/** Parent windows in the last 24 hours with an advisor send, across all logs of the repository. */
export function advisorWakes(path: string, now: Date): number {
  const directory = dirname(path);
  const name = basename(path);
  const prefix = name.slice(0, name.lastIndexOf('-') + 1);
  let files: string[];
  try { files = readdirSync(directory); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
  const since = now.getTime() - ADVISOR_CAP_SPAN_MS;
  let wakes = 0;
  for (const file of files.filter(file => file.startsWith(prefix) && file.endsWith('.jsonl'))) {
    const text = readFileSync(join(directory, file), 'utf8');
    // Different parents can start a window at the same time.
    const windows = new Set<string>();
    for (const line of text.split('\n').filter(Boolean)) {
      const record = JSON.parse(line) as AttentionLogRecordV1;
      if (record.kind === 'send' && record.route === 'advisor' && record.outcome === 'sent' && Date.parse(record.at) > since) windows.add(record.window);
    }
    wakes += windows.size;
  }
  return wakes;
}

export interface AttentionWindowInput {
  readonly parent: number;
  readonly deliver: boolean;
  /** The same code path as `board review --parent <n>`; set only when the watcher starts with `--review`, which needs `deliver`. */
  readonly review?: (observe: ReviewObserver) => Promise<unknown>;
  readonly log_path: string;
  readonly collect: () => BoardV1;
  readonly host: AttentionHostPortsV1;
  readonly now?: () => Date;
  readonly sleep?: (ms: number) => Promise<void>;
}

const sleepFor = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));

/**
 * One review pass: one log line and one message line per start or refusal. A
 * refused run (the lock, `gh`, an unknown launch) is a line too, so it never
 * ends the watcher; the marker of a started seat keeps the next window from a
 * second start for the same head.
 */
async function reviewWindow(review: (observe: ReviewObserver) => Promise<unknown>, log: (record: Record<string, unknown>) => void): Promise<string[]> {
  const lines: string[] = [];
  const note = (pr: number | null, seat: string | null, outcome: 'started' | 'refused', detail: string | null) => {
    log({ kind: 'review', pr, seat, outcome, detail });
    lines.push(pr === null ? `refused: ${detail}` : `PR #${pr} ${outcome}${seat === null ? '' : ` on ${seat}`}${detail === null ? '' : `: ${detail}`}`);
  };
  try {
    // Each event is noted as it happens: a later throw keeps every start that completed before it.
    await review(event => event.kind === 'started' ? note(event.pr, event.seat, 'started', event.marker_url) : note(event.pr, null, 'refused', event.reason));
  } catch (error) {
    note(null, null, 'refused', error instanceof Error ? error.message : String(error));
  }
  return lines;
}

/**
 * One window. A blocked terminal gets `hc wait` up to the window end. When the
 * wait ends with the terminal still blocked, the watcher reads its status
 * again at the window end: still blocked is `skipped_blocked` (hc refuses to
 * send to it), any other status gets the send then. So the skip never comes
 * before the window end, whatever `hc wait` returns for a blocked terminal.
 */
export async function runAttentionWindow(input: AttentionWindowInput): Promise<void> {
  const now = input.now ?? (() => new Date());
  const sleep = input.sleep ?? sleepFor;
  const started = now();
  const window = started.toISOString();
  const log = (record: Record<string, unknown>) => append(input.log_path, { at: now().toISOString(), window, parent: input.parent, ...record } as AttentionLogRecordV1);
  let board: BoardV1;
  try { board = input.collect(); } catch (error) {
    if (!boardAvailabilityFailure(error)) throw error;
    const message = error.message.slice(0, 300);
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.name, message })}\n`);
    log({ kind: 'error', message });
    return sleep(started.getTime() + WINDOW_WITH_WORKERS_MS - now().getTime());
  }
  const attention = evaluateBoardAttention(board);
  for (const finding of attention.findings) log({ kind: 'finding', rule: finding.rule, route: finding.route, message: finding.message });
  const reviewLines = input.review === undefined ? [] : await reviewWindow(input.review, log);
  const plan = planAttentionDeliveries(board, attention, advisorWakes(input.log_path, started));
  const end = started.getTime() + plan.window_ms;
  if (!input.deliver) return sleep(end - now().getTime());
  for (const skip of plan.skipped) log({ kind: 'skip', route: skip.route, reason: skip.reason });
  const record = (delivery: AttentionDeliveryV1, outcome: AttentionSendOutcome, detail: string | null = null) =>
    log({ kind: 'send', route: delivery.route, terminal: delivery.terminal, rules: delivery.rules, outcome, detail });
  // A failed host call is one failed send: the log keeps the host's message, and the other seats still get theirs.
  const send = (delivery: AttentionDeliveryV1) => {
    const sent = input.host.send(delivery.terminal, delivery.text);
    if (sent.status === 'sent') record(delivery, 'sent');
    else record(delivery, 'send_failed', sent.detail);
  };
  // The review message takes the delivery path of a finding: a blocked orchestrator gets `hc wait`, a working one the window end.
  const reviewText = `[rh-attention] #${input.parent} review: ${reviewLines.join('; ')}`;
  const deliveries = [...plan.deliveries, ...(reviewLines.length === 0 ? [] : liveSeatTerminals(board, 'orchestrator').map((terminal): AttentionDeliveryV1 =>
    ({ route: 'orchestrator', terminal: terminal.address, timing: deliveryTiming(terminal.status), rules: ['review'], text: reviewText })))];
  for (const delivery of deliveries.filter(entry => entry.timing === 'now')) send(delivery);
  const stillBlocked: AttentionDeliveryV1[] = [];
  for (const delivery of deliveries.filter(entry => entry.timing === 'after_wait')) {
    const seconds = Math.max(1, Math.floor((end - now().getTime()) / 1000));
    const waited = input.host.wait(delivery.terminal, seconds);
    if (waited.status === 'failed') record(delivery, 'send_failed', waited.detail);
    else if (waited.ended) record(delivery, 'terminal_ended', waited.reason);
    else if (waited.state === 'blocked') stillBlocked.push(delivery);
    else send(delivery);
  }
  await sleep(end - now().getTime());
  for (const delivery of stillBlocked) {
    const current = input.host.state(delivery.terminal);
    if (current.status === 'failed') record(delivery, 'send_failed', current.detail);
    else if (current.ended) record(delivery, 'terminal_ended', 'ended before the window end');
    else if (current.state === 'blocked') record(delivery, 'skipped_blocked', 'blocked at the window end');
    else send(delivery);
  }
  for (const delivery of deliveries.filter(entry => entry.timing === 'window_end')) send(delivery);
}

/** The repository id of the watcher terminal that runs this process. `--watch` runs only there, so doctor sees every watcher. */
export function serviceTerminalRepository(parent: number, host: AttentionHostPortsV1): number {
  const own = host.ownTerminal();
  const refuse = (why: string) => new AttentionWatchError(`--watch runs only in the hc terminal that \`${attentionStartCommand(parent)}\` opens (${why})`);
  if (own.status === 'failed') throw refuse(own.detail);
  if (own.parent !== String(parent) || own.repository === null || !/^[1-9][0-9]*$/u.test(own.repository)) {
    throw refuse(`terminal ${own.address} does not carry the repository and parent #${parent} labels`);
  }
  return Number(own.repository);
}

/** Start the watcher of one board unless a live one runs. Returns its address and whether it was started now. */
export function startAttentionWatch(input: {
  readonly parent: number; readonly repository_id: number; readonly repo_root: string; readonly cli: readonly [string, ...string[]]; readonly host: AttentionHostPortsV1;
  /** The Herdr space for review tabs; set to start the watcher with `--review`. */
  readonly review_space?: string;
}): { readonly address: string; readonly started: boolean } {
  const scope = { repository: input.repository_id, parent: input.parent };
  const refuse = (detail: string) => new AttentionWatchError(`hc did not start the attention watcher: ${detail}`);
  const read = input.host.watchers(scope);
  if (read.status === 'failed') throw refuse(read.detail);
  const live = read.watchers.find(watcher => watcher.state === 'live');
  if (live !== undefined) return { address: live.address, started: false };
  const started = input.host.startWatcher(scope, input.repo_root, [...input.cli, 'board', 'attention', '--parent', String(input.parent), '--watch', '--deliver',
    ...(input.review_space === undefined ? [] : ['--review', '--space', input.review_space])]);
  if (started.status === 'failed') throw refuse(started.detail);
  return { address: started.address, started: true };
}

/**
 * Read-only: the watcher terminals of the current repository by their service
 * label, finished ones too. Doctor runs in one repository, so the check reads
 * its repository id, and only when a watcher terminal exists. A checkout
 * without a GitHub remote has no repository id and no watcher. A parent whose
 * watcher terminals all finished is stopped. After `hc rm` removes them, the
 * parent has no watcher terminal and the result is `na`.
 */
export function attentionWatchDoctorCheck(host: AttentionHostPortsV1, repositoryId: () => number | null): { id: string; describe: string; status: 'ok' | 'warn' | 'na'; detail: string } {
  const id = 'board-attention-watcher';
  const describe = 'Board attention watcher';
  const read = host.watchers();
  if (read.status === 'failed') {
    if (read.reason === 'hc_missing') return { id, describe, status: 'na', detail: 'hc is not installed.' };
    return { id, describe, status: 'warn', detail: 'hc did not answer, so the watcher state is unknown (hc_unavailable).' };
  }
  if (read.watchers.length === 0) return { id, describe, status: 'na', detail: 'No attention watcher was started.' };
  let local: number | null;
  try { local = repositoryId(); } catch (error) {
    if (!(error instanceof BoardCollectError)) throw error;
    return { id, describe, status: 'warn', detail: `The GitHub repository id of this checkout is unknown, so its watcher state is unknown (repository_unknown): ${error.message}` };
  }
  if (local === null) return { id, describe, status: 'na', detail: 'This checkout has no GitHub remote, so it has no attention watcher.' };
  const repository = String(local);
  const parents = new Map<string, boolean>();
  for (const watcher of read.watchers.filter(entry => entry.repository === repository)) {
    const parent = watcher.parent ?? `(no parent label on ${watcher.address})`;
    parents.set(parent, (parents.get(parent) ?? false) || watcher.state === 'live');
  }
  if (parents.size === 0) return { id, describe, status: 'na', detail: `No attention watcher was started for repository ${repository}.` };
  const numeric = (parent: string) => /^[1-9][0-9]*$/u.test(parent);
  const name = (parent: string) => (numeric(parent) ? `#${parent}` : parent);
  const stopped = [...parents].filter(([, live]) => !live).map(([parent]) => parent);
  if (stopped.length > 0) {
    const commands = stopped.filter(numeric).map(parent => attentionStartCommand(Number(parent)));
    const run = commands.length === 0 ? '' : ` Run in the checkout of repository ${repository}: ${commands.join('; ')}`;
    return { id, describe, status: 'warn', detail: `The attention watcher of repository ${repository} ${stopped.map(name).join(', ')} is not live (attention_stopped).${run}` };
  }
  return { id, describe, status: 'ok', detail: `The attention watcher of repository ${repository} ${[...parents.keys()].map(name).join(', ')} is live.` };
}
