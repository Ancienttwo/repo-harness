/**
 * Pure attempt-ledger logic: receipt construction, ledger parsing, and the
 * no-progress stall verdict.
 *
 * The ledger is append-only ignored runtime evidence. This module is the only
 * place that knows what a well-formed receipt is, and it is deliberately dumb:
 * it derives nothing, resolves nothing, and never looks at repository state.
 * The recorder validates a shape and hands it to the effect layer; the envelope
 * resolver hands back the ledger's own bytes and gets one verdict.
 *
 * Stall rule (the whole circuit breaker):
 *
 *   Take the receipts for the CURRENT unit_ref, in file order. Walk backwards
 *   while a receipt is `outcome: completed` with
 *   `before_progress_token === after_progress_token === the current token`.
 *   Two or more such trailing receipts prove the loop ran twice and moved
 *   nothing -> `no_progress`.
 *
 * Everything else resets naturally, with no counter to persist: a receipt whose
 * tokens differ, a receipt recorded against an older token, a `halted` receipt,
 * and an explicit `resumed` receipt all stop the backward walk. Receipts for
 * other units are filtered out before the walk, so a different unit's traffic
 * neither triggers nor clears this unit's stall.
 *
 * The comparison is envelope-token to envelope-token only. The recorder is
 * handed the same inspect-scoped token `state next` publishes; an edit-scoped
 * `state resolve` token is a different scope and must never be recorded here
 * (WP2 review constraint).
 *
 * An unparseable line fails closed rather than being skipped: a breaker that
 * silently drops lines can mask a real stall, which is exactly the failure this
 * work package exists to prevent.
 */
import { evaluateNoProgress } from './no-progress';
import type { AttemptOutcome, AttemptReceiptV1 } from './types';

const ATTEMPT_OUTCOMES: ReadonlySet<string> = new Set<AttemptOutcome>([
  'completed',
  'halted',
  'resumed',
]);

/** Outcomes whose token claim is mandatory; `resumed` carries no token claim. */
const TOKEN_BEARING_OUTCOMES: ReadonlySet<string> = new Set<AttemptOutcome>([
  'completed',
  'halted',
]);

export const ATTEMPT_OUTCOME_VALUES: readonly AttemptOutcome[] = [
  'completed',
  'halted',
  'resumed',
];

export interface AttemptReceiptInput {
  readonly unitRef: string;
  readonly outcome: string;
  readonly beforeProgressToken?: string;
  readonly afterProgressToken?: string;
  readonly recordedAt: string;
}

export type AttemptReceiptBuild =
  | { readonly ok: true; readonly receipt: AttemptReceiptV1 }
  | { readonly ok: false; readonly error: string };

/**
 * Read result for the whole ledger file. `absent` and an empty file are both
 * `ok` with no receipts, so a repository that never recorded an attempt keeps
 * exactly its pre-WP3 envelope behavior.
 */
export type AttemptLedgerRead =
  | { readonly status: 'ok'; readonly receipts: readonly AttemptReceiptV1[] }
  | { readonly status: 'unreadable'; readonly line: number };

/** `none` leaves the WP2 route alone; the other two are `halt` reasons. */
export type AttemptStallVerdict = 'none' | 'no_progress' | 'attempt_ledger_unreadable';

const LINE_FRAMING_CHARACTERS = /[\r\n\0]/;

/**
 * One JSONL record must stay one line, so the framing and NUL hazards `\r`,
 * `\n`, `\0` are rejected. SPACE is deliberately legal: `JSON.stringify` keeps
 * it inside the quoted string without breaking the line, and rejecting it would
 * let one legal `unit_ref` path containing a space poison the ledger into a
 * permanent `attempt_ledger_unreadable` halt.
 */
function isSingleLineValue(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && !LINE_FRAMING_CHARACTERS.test(value);
}

/**
 * Validate the recorder's inputs and stamp the receipt. No repository read, no
 * token derivation, no defaulting: an incomplete claim is an error, never a
 * synthesized value.
 */
export function buildAttemptReceipt(input: AttemptReceiptInput): AttemptReceiptBuild {
  if (!isSingleLineValue(input.unitRef)) {
    return { ok: false, error: '--unit-ref must be a non-empty single-line value' };
  }
  if (!ATTEMPT_OUTCOMES.has(input.outcome)) {
    return {
      ok: false,
      error: `--outcome must be one of: ${ATTEMPT_OUTCOME_VALUES.join(', ')}`,
    };
  }
  const outcome = input.outcome as AttemptOutcome;
  const before = input.beforeProgressToken;
  const after = input.afterProgressToken;

  if (TOKEN_BEARING_OUTCOMES.has(outcome)) {
    if (!isSingleLineValue(before) || !isSingleLineValue(after)) {
      return {
        ok: false,
        error: `--outcome ${outcome} requires --before-progress-token and --after-progress-token`,
      };
    }
  } else {
    for (const [flag, value] of [
      ['--before-progress-token', before],
      ['--after-progress-token', after],
    ] as const) {
      if (value !== undefined && !isSingleLineValue(value)) {
        return { ok: false, error: `${flag} must be a non-empty single-line value` };
      }
    }
  }
  if (!isSingleLineValue(input.recordedAt)) {
    return { ok: false, error: 'recorded_at must be a non-empty single-line value' };
  }

  return {
    ok: true,
    receipt: {
      protocol: 1,
      kind: 'repo-harness-attempt-receipt',
      unit_ref: input.unitRef,
      before_progress_token: before ?? null,
      after_progress_token: after ?? null,
      outcome,
      recorded_at: input.recordedAt,
    },
  };
}

function parseReceiptLine(raw: string): AttemptReceiptV1 | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.protocol !== 1) return null;
  if (record.kind !== 'repo-harness-attempt-receipt') return null;
  if (!isSingleLineValue(record.unit_ref)) return null;
  if (typeof record.outcome !== 'string' || !ATTEMPT_OUTCOMES.has(record.outcome)) return null;
  if (!isSingleLineValue(record.recorded_at)) return null;

  const before = record.before_progress_token;
  const after = record.after_progress_token;
  for (const token of [before, after]) {
    if (token !== null && !isSingleLineValue(token)) return null;
  }
  const outcome = record.outcome as AttemptOutcome;
  if (TOKEN_BEARING_OUTCOMES.has(outcome) && (before === null || after === null)) return null;

  return {
    protocol: 1,
    kind: 'repo-harness-attempt-receipt',
    unit_ref: record.unit_ref,
    before_progress_token: before as string | null,
    after_progress_token: after as string | null,
    outcome,
    recorded_at: record.recorded_at,
  };
}

/**
 * Parse the ledger's own bytes. `null` is an absent ledger. The empty segment
 * after the trailing newline every append writes is JSONL framing, not a
 * record; any other unparseable or malformed line makes the ledger unreadable.
 */
export function parseAttemptLedger(text: string | null): AttemptLedgerRead {
  if (text === null) return { status: 'ok', receipts: [] };
  const receipts: AttemptReceiptV1[] = [];
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    if (raw === '' && index === lines.length - 1) continue;
    const receipt = parseReceiptLine(raw);
    if (receipt === null) return { status: 'unreadable', line: index + 1 };
    receipts.push(receipt);
  }
  return { status: 'ok', receipts };
}

/**
 * The stall verdict for one unit at one token. Deterministic in the ledger's
 * bytes and the current token; reads nothing else.  Its receipt wire shape is
 * unchanged; only the trailing-two calculation is shared with repair loops.
 */
export function evaluateAttemptStall(
  ledger: AttemptLedgerRead,
  unitRef: string | null,
  currentProgressToken: string,
): AttemptStallVerdict {
  if (ledger.status === 'unreadable') return 'attempt_ledger_unreadable';
  if (unitRef === null) return 'none';

  const forUnit = ledger.receipts.filter((receipt) => receipt.unit_ref === unitRef);
  return evaluateNoProgress(
    forUnit.map((receipt) => ({
      outcome: receipt.outcome,
      before_token: receipt.before_progress_token,
      after_token: receipt.after_progress_token,
    })),
    currentProgressToken,
  );
}
