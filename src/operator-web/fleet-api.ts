import {
  DEFAULT_OPERATOR_LOCALE,
  isOperatorMessageKey,
  translate,
  type OperatorMessageKey,
  type OperatorTranslate,
} from './i18n';
import {
  decodeOperatorCollaborationSnapshot,
  decodeOperatorFleetSnapshot,
  OPERATOR_COLLABORATION_PAYLOAD_INVALID_ERROR,
  OPERATOR_PAYLOAD_INVALID_ERROR,
  type OperatorApiErrorCode,
  type OperatorApiErrorV1,
  type OperatorCollaborationSnapshotV4,
  type OperatorFleetSnapshotV1,
} from './types';

/**
 * A typed error the browser raises for itself. Its sentences are read out of the
 * dictionary rather than restated here, so the board and a rejected promise
 * cannot disagree about what the same code means.
 */
export function clientApiError(code: OperatorApiErrorCode): OperatorApiErrorV1 {
  return Object.freeze({
    code,
    message: translate(DEFAULT_OPERATOR_LOCALE, `error.${code}.message` as OperatorMessageKey),
    next_action: translate(DEFAULT_OPERATOR_LOCALE, `error.${code}.action` as OperatorMessageKey),
  });
}

const DEFAULT_API_ERROR: OperatorApiErrorV1 = clientApiError('operator_api_unavailable');
export const COLLABORATION_UNAVAILABLE_ERROR: OperatorApiErrorV1 = clientApiError('collaboration_snapshot_unavailable');
const COLLABORATION_REPOSITORY_MISMATCH_ERROR: OperatorApiErrorV1 = clientApiError('collaboration_repository_mismatch');

export interface LocalizedApiError {
  readonly message: string;
  readonly next_action: string;
  /** False when the sentence below is the server's own English, not board copy. */
  readonly localized: boolean;
}

/**
 * Error copy is client-owned and keyed by the typed code. A code outside the
 * closed set belongs to a server ahead of this bundle: its English sentence is
 * shown, and labelled as the server's rather than presented as board copy.
 */
export function localizeApiError(error: OperatorApiErrorV1, t: OperatorTranslate): LocalizedApiError {
  const messageKey = `error.${error.code}.message`;
  const actionKey = `error.${error.code}.action`;
  if (isOperatorMessageKey(messageKey) && isOperatorMessageKey(actionKey)) {
    return { message: t(messageKey), next_action: t(actionKey), localized: true };
  }
  return { message: error.message, next_action: error.next_action, localized: false };
}

function isTypedApiError(value: unknown): value is OperatorApiErrorV1 {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<OperatorApiErrorV1>;
  return typeof candidate.code === 'string' && candidate.code.trim().length > 0
    && typeof candidate.message === 'string' && candidate.message.trim().length > 0
    && typeof candidate.next_action === 'string' && candidate.next_action.trim().length > 0;
}

/** Accept only the two typed transport forms. Unknown values use the safe default. */
export function asApiError(value: unknown, fallback = DEFAULT_API_ERROR): OperatorApiErrorV1 {
  if (isTypedApiError(value)) return value;
  if (value && typeof value === 'object') {
    const envelope = value as { readonly error?: unknown };
    if (isTypedApiError(envelope.error)) return envelope.error;
  }
  return fallback;
}

export async function fetchOperatorSnapshot(signal?: AbortSignal): Promise<OperatorFleetSnapshotV1> {
  const response = await fetch('/api/v1/fleet/snapshot', {
    headers: { Accept: 'application/json' },
    cache: 'no-store', signal,
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) throw asApiError(body);
  try {
    return decodeOperatorFleetSnapshot(body);
  } catch (error) {
    if (error instanceof Error && error.name === 'OperatorPayloadError') throw error;
    throw OPERATOR_PAYLOAD_INVALID_ERROR;
  }
}

export function assertCollaborationRepository(
  snapshot: OperatorCollaborationSnapshotV4,
  repositoryId: string,
  decisionAfter: string | null = null,
): OperatorCollaborationSnapshotV4 {
  if (snapshot.repository_id !== repositoryId || snapshot.decision_after !== decisionAfter) throw COLLABORATION_REPOSITORY_MISMATCH_ERROR;
  return snapshot;
}

export async function fetchOperatorCollaborationSnapshot(
  repositoryId: string,
  signal?: AbortSignal,
  decisionAfter: string | null = null,
): Promise<OperatorCollaborationSnapshotV4> {
  if (decisionAfter !== null && !/^[0-9a-f]{64}$/u.test(decisionAfter)) throw OPERATOR_COLLABORATION_PAYLOAD_INVALID_ERROR;
  const query = decisionAfter === null ? '' : `?decision_after=${decisionAfter}`;
  const response = await fetch(`/api/v1/collaboration/${encodeURIComponent(repositoryId)}/snapshot${query}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal,
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) throw asApiError(body, COLLABORATION_UNAVAILABLE_ERROR);
  let snapshot: OperatorCollaborationSnapshotV4;
  try {
    snapshot = decodeOperatorCollaborationSnapshot(body);
  } catch {
    // Fleet and collaboration payloads are separate authorities. Keep a
    // malformed collaboration response from borrowing Fleet diagnostics.
    throw OPERATOR_COLLABORATION_PAYLOAD_INVALID_ERROR;
  }
  return assertCollaborationRepository(snapshot, repositoryId, decisionAfter);
}
