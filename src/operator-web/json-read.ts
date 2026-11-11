/**
 * The read prelude of the typed GET fetchers. An abort rethrows; a request
 * with no response is `unreachable`; a body that is not JSON reads as null.
 * Each caller maps the answer to its own reasons.
 */
export type JsonRead = { readonly state: 'answered'; readonly ok: boolean; readonly body: unknown } | { readonly state: 'unreachable' };
export type JsonAnswer = Extract<JsonRead, { readonly state: 'answered' }>;

export async function jsonAnswer(response: Response): Promise<JsonAnswer> {
  return { state: 'answered', ok: response.ok, body: await response.json().catch(() => null) };
}

export async function readJson(url: string, signal: AbortSignal): Promise<JsonRead> {
  let response: Response;
  try {
    response = await fetch(url, { signal, cache: 'no-store', headers: { Accept: 'application/json' } });
  } catch (error) {
    if (signal.aborted) throw error;
    return { state: 'unreachable' };
  }
  return jsonAnswer(response);
}
