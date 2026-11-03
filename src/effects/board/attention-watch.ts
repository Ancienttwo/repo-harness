import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { evaluateBoardAttention } from '../../core/board/attention';
import { ADVISOR_CAP_SPAN_MS, planAttentionDeliveries, type AttentionDeliveryV1, type AttentionHostPortsV1 } from '../../core/board/attention-delivery';
import type { BoardV1 } from '../../core/board/board';
import { repoHarnessHome } from '../repo-harness-home';

/**
 * The resident attention watcher (#1509). It runs in an hc terminal that
 * carries the service label and the repository and parent labels of its
 * board. Each window it reads the board once, runs the attention rules, sends
 * the findings to the seat terminals and appends every finding and every send
 * attempt to its log. A failed board read ends the watcher; doctor then
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
  | { readonly kind: 'finding'; readonly rule: string; readonly route: string; readonly message: string }
  | { readonly kind: 'skip'; readonly route: string; readonly reason: string }
  | { readonly kind: 'send'; readonly route: string; readonly terminal: string; readonly rules: readonly string[]; readonly outcome: AttentionSendOutcome; readonly detail: string | null }
);

function append(path: string, record: AttentionLogRecordV1): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  appendFileSync(path, `${JSON.stringify(record)}\n`, { mode: 0o600 });
}

/** Windows in the last 24 hours with at least one advisor send. A seat wakes once per window, however many terminals it has. */
export function advisorWakes(path: string, now: Date): number {
  let text: string;
  try { text = readFileSync(path, 'utf8'); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
  const since = now.getTime() - ADVISOR_CAP_SPAN_MS;
  const windows = new Set<string>();
  for (const line of text.split('\n').filter(Boolean)) {
    const record = JSON.parse(line) as AttentionLogRecordV1;
    if (record.kind === 'send' && record.route === 'advisor' && record.outcome === 'sent' && Date.parse(record.at) > since) windows.add(record.window);
  }
  return windows.size;
}

export interface AttentionWindowInput {
  readonly parent: number;
  readonly deliver: boolean;
  readonly log_path: string;
  readonly collect: () => BoardV1;
  readonly host: AttentionHostPortsV1;
  readonly now?: () => Date;
  readonly sleep?: (ms: number) => Promise<void>;
}

const sleepFor = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));

/**
 * One window. `hc wait` ends when the terminal stops working or at its
 * timeout, and reports the status it ended with; a terminal that is still
 * blocked then gets no send, because hc refuses to send to it.
 */
export async function runAttentionWindow(input: AttentionWindowInput): Promise<void> {
  const now = input.now ?? (() => new Date());
  const sleep = input.sleep ?? sleepFor;
  const started = now();
  const window = started.toISOString();
  const log = (record: Record<string, unknown>) => append(input.log_path, { at: now().toISOString(), window, parent: input.parent, ...record } as AttentionLogRecordV1);
  const board = input.collect();
  const attention = evaluateBoardAttention(board);
  for (const finding of attention.findings) log({ kind: 'finding', rule: finding.rule, route: finding.route, message: finding.message });
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
  for (const delivery of plan.deliveries.filter(entry => entry.timing === 'now')) send(delivery);
  for (const delivery of plan.deliveries.filter(entry => entry.timing === 'after_wait')) {
    const seconds = Math.max(1, Math.floor((end - now().getTime()) / 1000));
    const waited = input.host.wait(delivery.terminal, seconds);
    if (waited.status === 'failed') record(delivery, 'send_failed', waited.detail);
    else if (waited.ended) record(delivery, 'terminal_ended', waited.reason);
    else if (waited.state === 'blocked') record(delivery, 'skipped_blocked', waited.reason);
    else send(delivery);
  }
  await sleep(end - now().getTime());
  for (const delivery of plan.deliveries.filter(entry => entry.timing === 'window_end')) send(delivery);
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
}): { readonly address: string; readonly started: boolean } {
  const scope = { repository: input.repository_id, parent: input.parent };
  const refuse = (detail: string) => new AttentionWatchError(`hc did not start the attention watcher: ${detail}`);
  const read = input.host.watchers(scope);
  if (read.status === 'failed') throw refuse(read.detail);
  const live = read.watchers.find(watcher => watcher.state === 'live');
  if (live !== undefined) return { address: live.address, started: false };
  const started = input.host.startWatcher(scope, input.repo_root, [...input.cli, 'board', 'attention', '--parent', String(input.parent), '--watch', '--deliver']);
  if (started.status === 'failed') throw refuse(started.detail);
  return { address: started.address, started: true };
}

/**
 * Read-only: the watcher terminals by their service label, finished ones too.
 * A board whose watcher terminals all finished is stopped. After `hc rm`
 * removes them, the board has no watcher terminal and the result is `na`.
 */
export function attentionWatchDoctorCheck(host: AttentionHostPortsV1): { id: string; describe: string; status: 'ok' | 'warn' | 'na'; detail: string } {
  const id = 'board-attention-watcher';
  const describe = 'Board attention watcher';
  const read = host.watchers();
  if (read.status === 'failed') {
    if (read.reason === 'hc_missing') return { id, describe, status: 'na', detail: 'hc is not installed.' };
    return { id, describe, status: 'warn', detail: 'hc did not answer, so the watcher state is unknown (hc_unavailable).' };
  }
  const boards = new Map<string, boolean>();
  for (const watcher of read.watchers) {
    const parent = watcher.parent ?? `(no parent label on ${watcher.address})`;
    boards.set(parent, (boards.get(parent) ?? false) || watcher.state === 'live');
  }
  if (boards.size === 0) return { id, describe, status: 'na', detail: 'No attention watcher was started.' };
  const numeric = (parent: string) => /^[1-9][0-9]*$/u.test(parent);
  const name = (parent: string) => (numeric(parent) ? `#${parent}` : parent);
  const stopped = [...boards].filter(([, live]) => !live).map(([parent]) => parent);
  if (stopped.length > 0) {
    const commands = stopped.filter(numeric).map(parent => attentionStartCommand(Number(parent)));
    const run = commands.length === 0 ? '' : ` Run in the repository: ${commands.join('; ')}`;
    return { id, describe, status: 'warn', detail: `The attention watcher of ${stopped.map(name).join(', ')} is not live (attention_stopped).${run}` };
  }
  return { id, describe, status: 'ok', detail: `The attention watcher of ${[...boards.keys()].map(name).join(', ')} is live.` };
}
