// The handoff reset of the orchestrator and advisor seats (#1972). Each Opus auto-compaction on Max started at
// 461k-467k context tokens, and a resumed seat uses about 94k. A reset at 380k leaves room for the handoff turn.

/** The seats that reset through a handoff. The `repo-harness seats argv` env names one of them. */
export const RESET_SEATS = ['orchestrator', 'advisor'] as const;
export type ResetSeat = typeof RESET_SEATS[number];

/** The env of a reset seat, set only by `repo-harness seats argv` with `--repository-id`. */
export const SEAT_ENV = 'REPO_HARNESS_SEAT';
export const SEAT_REPOSITORY_ENV = 'REPO_HARNESS_SEAT_REPOSITORY';

export const SEAT_RESET_CONTEXT_TOKENS = 380_000;

/** The issue fixes this path; a resumed seat reads it after `/clear`. */
const SEATS_ROOT = '/tmp/repo-harness-seats';
const POSITIVE = /^[1-9][0-9]*$/u;

export interface SeatResetIdentity {
  readonly seat: ResetSeat;
  readonly repository: string;
}

export function isResetSeat(value: unknown): value is ResetSeat {
  return RESET_SEATS.includes(value as ResetSeat);
}

/** The seat identity from the env, or null when the session is not a reset seat. */
export function seatResetIdentity(env: NodeJS.ProcessEnv): SeatResetIdentity | null {
  const seat = env[SEAT_ENV];
  const repository = env[SEAT_REPOSITORY_ENV];
  return isResetSeat(seat) && repository !== undefined && POSITIVE.test(repository) ? { seat, repository } : null;
}

export const seatResetDirectory = (identity: SeatResetIdentity): string => `${SEATS_ROOT}/${identity.repository}/${identity.seat}`;
export const seatHandoffPath = (identity: SeatResetIdentity): string => `${seatResetDirectory(identity)}/handoff.md`;
/** The hook writes this file when it blocks the stop; a handoff older than it is stale. */
export const seatResetRequestPath = (identity: SeatResetIdentity): string => `${seatResetDirectory(identity)}/request.json`;

/** The SessionStart hook writes this file for a new session of the seat: the new-session signal of the reset. */
export const seatSessionPath = (identity: SeatResetIdentity): string => `${seatResetDirectory(identity)}/session.json`;
/** One JSON line per reset failure. It is the only record of the rewrite and resend counts. */
export const seatResetLogPath = (identity: SeatResetIdentity): string => `${seatResetDirectory(identity)}/reset-log.jsonl`;

/** At most this many handoff rewrites and resume prompt resends per request. */
export const SEAT_RESET_RETRIES = 3;

/** The identity of a handoff path, or null when the path is not the handoff path of a reset seat. */
export function handoffIdentity(path: string): SeatResetIdentity | null {
  const [, repository, seat] = /^\/tmp\/repo-harness-seats\/([^/]+)\/([^/]+)\/handoff\.md$/u.exec(path) ?? [];
  return isResetSeat(seat) && POSITIVE.test(repository ?? '') ? { seat, repository: repository! } : null;
}

export const HANDOFF_SECTIONS = [
  'Role', 'Hard rules', 'Current state', 'In progress', 'Owner decisions pending', 'Next actions', 'Resume checklist',
] as const;

const RESUME_CHECKLIST = [
  'Recent merged PRs: `gh pr list --state merged --limit 10`.',
  'Open PRs with CI: `gh pr list --state open` and `gh pr checks <n>`.',
  'Parent-issue progress: `gh issue view <parent>`.',
  'Seats: `hc ls --label repo-harness.repository=<repository-id>`, read the `repo-harness.seat` labels.',
  'Quota: `repo-harness quota`.',
];

/** The fixed handoff template. Every section heading must stay; the resume checklist is fixed. */
export function seatHandoffTemplate(): string {
  return HANDOFF_SECTIONS.map(section => section === 'Resume checklist'
    ? `## ${section}\n\n${RESUME_CHECKLIST.map(item => `- ${item}`).join('\n')}\n`
    : `## ${section}\n\n<fill in>\n`).join('\n');
}

/** The sections that the handoff text does not have as a `## <section>` line. */
export function missingHandoffSections(text: string): string[] {
  const headings = new Set(text.split('\n').map(line => line.trimEnd()));
  return HANDOFF_SECTIONS.filter(section => !headings.has(`## ${section}`));
}

const PEER: Readonly<Record<ResetSeat, ResetSeat>> = { orchestrator: 'advisor', advisor: 'orchestrator' };

/** The block reason of the Stop hook: the model writes the handoff, then asks its peer seat for the reset. */
export function seatResetReason(identity: SeatResetIdentity, contextTokens: number): string {
  const path = seatHandoffPath(identity);
  return [
    `repo-harness: the ${identity.seat} seat context is ${contextTokens} tokens, at or above ${SEAT_RESET_CONTEXT_TOKENS}. Reset before auto-compaction.`,
    `1. Write the handoff to ${path} with exactly these sections:`,
    '',
    seatHandoffTemplate(),
    `2. Take its sha256 with \`shasum -a 256 ${path}\`.`,
    `3. Send \`RESET-REQUEST ${path} <sha256>\` to the ${PEER[identity.seat]} seat (repo-harness.seat=${PEER[identity.seat]}) with hc send, then end your turn.`,
    `On REWRITE, write the handoff again and send RESET-REQUEST again. On NO-RESET, continue.`,
    `When the ${PEER[identity.seat]} seat is missing or does not answer, continue without a reset: Claude Code auto-compaction handles the context.`,
  ].join('\n');
}

/** The prompt that the peer sends after `/clear`. */
export function seatResumePrompt(identity: SeatResetIdentity, peerAddress: string): string {
  return `You are ${identity.seat}. Read ${seatHandoffPath(identity)}, check the current state with git/gh, then continue. Then send RESUMED to ${peerAddress} with hc send.`;
}

/** The message to the requester when its handoff fails a check. */
export function seatRewriteMessage(identity: SeatResetIdentity, problem: string, attempt: number): string {
  return `REWRITE ${attempt}/${SEAT_RESET_RETRIES}: ${problem} Write ${seatHandoffPath(identity)} again and send RESET-REQUEST again.`;
}

/** The message to the requester when its handoff failed every rewrite: no reset, auto-compaction handles the context. */
export const SEAT_NO_RESET_MESSAGE = 'NO-RESET: the handoff failed every rewrite. Continue your work; Claude Code auto-compaction handles the context.';
