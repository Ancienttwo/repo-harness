/**
 * The versioned adapter that turns one run's persisted stdout into a
 * `CollaborationContributionDraftV1`.
 *
 * Sprint row C4. The rule this module exists to enforce is a sourcing rule, not
 * a parsing convenience: **a draft may only come from the exact stdout bytes the
 * Host persisted for that run.** A caller handing over JSON it says came from a
 * Worker is refused, because there is no parameter here that accepts one — the
 * only input is a dispatch id, and the bytes are fetched from the process
 * receipt's own evidence blob and checked against its recorded digest before
 * anything is parsed.
 *
 * Failure is a typed rejection with a reason from a closed set. It is never an
 * empty draft: a Worker that produced nothing and a Worker whose output could
 * not be read must not look the same to a reader, and the second one must not
 * look like a success.
 *
 * Zero delivery-plane write (D1): this module only reads.
 */
import { realpathSync } from 'fs';

import { CollaborationError } from '../../core/collaboration/common';
import {
  validateCollaborationContributionDraft,
  type CollaborationContributionDraftV1,
} from '../../core/collaboration/contribution';
import {
  readCodexProcessReceipt,
  readDelegatedRunEvidenceBlob,
} from '../engineers/delegated-run-store';

/**
 * The adapter version. It names the provider surface and the wire shape, and it
 * travels on every rejection so a failure can be attributed to a specific
 * reader rather than to "parsing".
 */
export const PROVIDER_OUTPUT_ADAPTER_VERSION = 'codex-exec-stdout/v1' as const;

/**
 * The marker pair a Worker wraps its draft in, reusing the convention
 * `task-message.ts` and `module-message.ts` already established for framed
 * content. Markers must each appear exactly once and each own its whole line;
 * everything outside them is the Worker's prose and is ignored.
 */
export const CONTRIBUTION_OUTPUT_START = '[RepoHarnessCollaborationContributionV1]';
export const CONTRIBUTION_OUTPUT_END = '[/RepoHarnessCollaborationContributionV1]';

/** Every way the adapter can refuse. Closed, so a caller can enumerate them. */
export const CONTRIBUTION_ADAPTER_REJECTION_REASONS = [
  /** Neither marker, or only one of the two, appeared. */
  'adapter_marker_missing',
  /** A marker appeared more than once, or the end preceded the start. */
  'adapter_marker_ambiguous',
  /** The framed region is not JSON. */
  'adapter_payload_not_json',
  /** The framed region is JSON but not a valid draft. */
  'draft_invalid',
] as const;
export type ContributionAdapterRejectionReason =
  (typeof CONTRIBUTION_ADAPTER_REJECTION_REASONS)[number];

/**
 * A parse refusal.
 *
 * This is a distinct class rather than a `CollaborationError` variant because
 * the collector has to treat it differently from every other failure: it is the
 * one failure where a normal `WorkerResultV1` must still be persisted. A store
 * error means the write path is broken; this means the Worker's output was not
 * usable, which is a legitimate run outcome.
 */
export class CollaborationContributionRejection extends Error {
  constructor(
    readonly reason: ContributionAdapterRejectionReason,
    message: string,
    readonly adapter_version: string = PROVIDER_OUTPUT_ADAPTER_VERSION,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'CollaborationContributionRejection';
  }
}

function reject(
  reason: ContributionAdapterRejectionReason,
  message: string,
  cause?: unknown,
): never {
  throw new CollaborationContributionRejection(reason, message, PROVIDER_OUTPUT_ADAPTER_VERSION, cause);
}

/**
 * Extract and validate a draft from raw provider stdout.
 *
 * Exported separately from the store-reading entrypoint so the framing rules can
 * be proven directly against bytes, without a delegated run having to exist.
 */
export function parseContributionDraftFromStdout(stdout: string): CollaborationContributionDraftV1 {
  const lines = stdout.split('\n');
  const starts: number[] = [];
  const ends: number[] = [];
  lines.forEach((line, index) => {
    // The marker owns its whole line. A trailing `\r` is tolerated because it is
    // a line-ending artefact rather than content; nothing else is.
    const trimmed = line.endsWith('\r') ? line.slice(0, -1) : line;
    if (trimmed === CONTRIBUTION_OUTPUT_START) starts.push(index);
    if (trimmed === CONTRIBUTION_OUTPUT_END) ends.push(index);
  });
  if (starts.length === 0 || ends.length === 0) {
    reject('adapter_marker_missing', 'provider output carries no contribution block');
  }
  if (starts.length > 1 || ends.length > 1) {
    reject('adapter_marker_ambiguous', 'provider output carries more than one contribution block');
  }
  if (ends[0] < starts[0]) {
    reject('adapter_marker_ambiguous', 'provider output closes a contribution block it never opened');
  }
  const payload = lines.slice(starts[0] + 1, ends[0]).join('\n');
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch (error) {
    reject('adapter_payload_not_json', 'contribution block is not JSON', error);
  }
  try {
    return validateCollaborationContributionDraft(parsed);
  } catch (error) {
    // Kept as a rejection rather than propagating the CollaborationError: from
    // the collector's point of view an invalid draft and an unparsable one are
    // the same run outcome, and both must still persist a WorkerResult.
    reject(
      'draft_invalid',
      error instanceof CollaborationError
        ? `contribution draft is invalid: ${error.message}`
        : 'contribution draft is invalid',
      error,
    );
  }
}

export interface PersistedProviderOutput {
  readonly draft: CollaborationContributionDraftV1;
  /** The receipt's own observation time; the collector uses it as recorded time. */
  readonly observed_at: string;
  readonly stdout_sha256: string;
  readonly adapter_version: typeof PROVIDER_OUTPUT_ADAPTER_VERSION;
}

/**
 * Read the draft for one dispatch from the exact bytes the Host persisted.
 *
 * `readDelegatedRunEvidenceBlob()` re-hashes the blob and refuses if it does not
 * match the digest the receipt recorded, so a draft can never come from stdout
 * that was edited after the run.
 */
export function readContributionDraftFromPersistedOutput(
  repoRoot: string,
  processReceiptSha256: string,
): PersistedProviderOutput {
  const root = realpathSync(repoRoot);
  const receipt = readCodexProcessReceipt(root, processReceiptSha256);
  const stdout = readDelegatedRunEvidenceBlob(root, receipt.stdout_ref, receipt.stdout_sha256);
  return Object.freeze({
    draft: parseContributionDraftFromStdout(stdout.toString('utf8')),
    observed_at: receipt.observed_at,
    stdout_sha256: receipt.stdout_sha256,
    adapter_version: PROVIDER_OUTPUT_ADAPTER_VERSION,
  });
}
