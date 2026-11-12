// The handoff reset of the orchestrator and advisor seats (#1972, #2625). Each Opus auto-compaction on Max started at
// 461k-467k context tokens, and a resumed seat uses about 94k. A reset at 380k leaves room for the handoff turn.

/** The seats that reset through a handoff. The `repo-harness seats argv` env names one of them. */
export const RESET_SEATS = ['orchestrator', 'advisor'] as const;
export type ResetSeat = typeof RESET_SEATS[number];

/** The env of a reset seat, set only by `repo-harness seats argv` with `--repository-id`. */
export const SEAT_ENV = 'REPO_HARNESS_SEAT';
export const SEAT_REPOSITORY_ENV = 'REPO_HARNESS_SEAT_REPOSITORY';

export const SEAT_RESET_CONTEXT_TOKENS = 380_000;

/**
 * Owner bound (#2625): below it the peer types `/compact`, at or above it `/clear`. `/compact` keeps the transcript
 * file, so the file grows by 3.4-4.7 MB per cycle; 32 MiB gives 6 to 9 compactions before a `/clear` starts a new file
 * and the seat checks its state against git and gh again.
 */
export const SEAT_RESET_TRANSCRIPT_BYTES = 32 * 1024 * 1024;

/** The action that the Stop hook records in the request and `seats reset` carries out. */
export type SeatResetAction = 'compact' | 'reset';

export function isSeatResetAction(value: unknown): value is SeatResetAction {
  return value === 'compact' || value === 'reset';
}

export const seatResetAction = (transcriptBytes: number): SeatResetAction => (transcriptBytes < SEAT_RESET_TRANSCRIPT_BYTES ? 'compact' : 'reset');

/** The slash command that the peer types for each action. */
export const SEAT_RESET_COMMAND: Readonly<Record<SeatResetAction, '/compact' | '/clear'>> = { compact: '/compact', reset: '/clear' };

/** The issue fixes this path; a resumed seat reads it after `/compact` or `/clear`. */
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

/** The SessionStart sources that record a new session segment of the seat. */
export const SEAT_SESSION_SOURCES = ['startup', 'clear', 'compact'] as const;
export type SeatSessionSource = typeof SEAT_SESSION_SOURCES[number];

export function isSeatSessionSource(value: unknown): value is SeatSessionSource {
  return SEAT_SESSION_SOURCES.includes(value as SeatSessionSource);
}

/** The SessionStart hook writes this file for a new session of the seat: the new-session signal of the reset. */
export const seatSessionPath = (identity: SeatResetIdentity): string => `${seatResetDirectory(identity)}/session.json`;
/** One JSON line per reset failure. It is the only record of the rewrite and resend counts. */
export const seatResetLogPath = (identity: SeatResetIdentity): string => `${seatResetDirectory(identity)}/reset-log.jsonl`;
/** Created once with an exclusive create before `/compact` or `/clear`: no second run acts on the same request. */
export const seatResetClaimPath = (identity: SeatResetIdentity, requestedAt: string): string => `${seatResetDirectory(identity)}/claim-${requestedAt.replace(/\D/gu, '')}`;

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

/**
 * The handoff steps: the model finishes the work in hand, writes the handoff, then asks its peer seat for the reset.
 * The Stop hook and `seats handoff` print them. Step 0 is the joint decision of #2625 (owner word 2026-11-12): no hard
 * stop, but no new work after the threshold.
 */
export function seatResetSteps(identity: SeatResetIdentity, action: SeatResetAction): string {
  const path = seatHandoffPath(identity);
  return [
    '0. Finish the planning and the dispatch that you have in hand. Start nothing new. Then write the handoff.',
    `1. Write the handoff to ${path} with exactly these sections:`,
    '',
    seatHandoffTemplate(),
    `2. Take its sha256 with \`shasum -a 256 ${path}\`.`,
    `3. Send \`RESET-REQUEST ${path} <sha256>\` to the ${PEER[identity.seat]} seat (repo-harness.seat=${PEER[identity.seat]}) with hc send, then end your turn. The ${PEER[identity.seat]} seat types ${SEAT_RESET_COMMAND[action]} in this session.`,
    `On REWRITE, write the handoff again and send RESET-REQUEST again. On NO-RESET, continue.`,
    `When the ${PEER[identity.seat]} seat is missing or does not answer, continue without a reset: Claude Code auto-compaction handles the context.`,
  ].join('\n');
}

/** The block reason of the Stop hook: the token reason and the action, then the handoff steps. */
export function seatResetReason(identity: SeatResetIdentity, contextTokens: number, transcriptBytes: number, action: SeatResetAction): string {
  const side = action === 'compact' ? 'below' : 'at or above';
  return `repo-harness: the ${identity.seat} seat context is ${contextTokens} tokens, at or above ${SEAT_RESET_CONTEXT_TOKENS}. Reset before auto-compaction. `
    + `The transcript is ${transcriptBytes} bytes, ${side} ${SEAT_RESET_TRANSCRIPT_BYTES}, so the reset types ${SEAT_RESET_COMMAND[action]}.\n${seatResetSteps(identity, action)}`;
}

/**
 * The prompt that the peer sends after the new-session signal. RESUMED comes first, so its hc send is the resume
 * evidence. After `/compact` the summary holds the live state, so only `/clear` asks for the git and gh check.
 */
export function seatResumePrompt(identity: SeatResetIdentity, peerAddress: string, action: SeatResetAction): string {
  const next = action === 'compact' ? 'then continue.' : 'then check the current state with git/gh and continue.';
  return `You are ${identity.seat}. Read ${seatHandoffPath(identity)}, then run the Bash command \`hc send ${peerAddress} RESUMED\` alone, ${next}`;
}

/** The message to the requester when its handoff fails a check. */
export function seatRewriteMessage(identity: SeatResetIdentity, problem: string, attempt: number): string {
  return `REWRITE ${attempt}/${SEAT_RESET_RETRIES}: ${problem} Write ${seatHandoffPath(identity)} again and send RESET-REQUEST again.`;
}

/** The message that releases the requester with no reset: it continues, and auto-compaction handles the context. */
export function seatNoResetMessage(reason: string): string {
  return `NO-RESET: ${reason}. Continue your work; Claude Code auto-compaction handles the context.`;
}
