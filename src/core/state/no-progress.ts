/**
 * Shared trailing-attempt circuit breaker.  The caller owns receipt parsing
 * and scope selection; this module deliberately knows only the three fields
 * needed to prove that a completed action left its observed token unchanged.
 */
export const NO_PROGRESS_THRESHOLD = 2;

export type NoProgressVerdict = 'none' | 'no_progress';

export interface NoProgressAttempt {
  readonly outcome: string;
  readonly before_token: string | null;
  readonly after_token: string | null;
}

/**
 * Two trailing completed attempts with the same before/after token prove that
 * repeating the action made no observed progress.  Any other trailing record
 * resets the run naturally, so callers need no mutable counter or reset write.
 */
export function evaluateNoProgress(
  attempts: readonly NoProgressAttempt[],
  currentToken: string,
): NoProgressVerdict {
  let trailing = 0;
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    const attempt = attempts[index]!;
    const stalled = attempt.outcome === 'completed'
      && attempt.before_token === currentToken
      && attempt.after_token === currentToken;
    if (!stalled) break;
    trailing += 1;
  }
  return trailing >= NO_PROGRESS_THRESHOLD ? 'no_progress' : 'none';
}
