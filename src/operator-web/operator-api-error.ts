/** The typed refusal body of every operator API route: `{ error: OperatorApiErrorV1 }`. */
export interface OperatorApiErrorV1 {
  readonly code: string;
  readonly message: string;
  readonly next_action: string;
}

/** A request with no typed answer: no response body, or one that is not a typed refusal. */
const DEFAULT_API_ERROR: OperatorApiErrorV1 = Object.freeze({
  code: 'operator_api_unavailable',
  message: 'The operator API gave no typed answer.',
  next_action: 'Check that `rh operator serve` runs, then retry.',
});

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
