import { Banner } from '@cloudflare/kumo';
import type { OperatorTranslate } from './i18n';
import { asApiError, type OperatorApiErrorV1 } from './operator-api-error';

/**
 * `reload_required`: the service that issued this page's write token no longer
 * runs, so the request did not run and only a new page can write.
 * `retry_after_seconds`: the wait of a route that names one beside the error.
 * `unreachable`: no typed answer arrived, so the request may or may not have run.
 * `unreadable`: a 200 whose body failed the decoder; the write ran.
 */
export type OperatorWriteFailure =
  | { readonly state: 'refused'; readonly status: number; readonly error: OperatorApiErrorV1; readonly retry_after_seconds?: number }
  | { readonly state: 'reload_required' }
  | { readonly state: 'unreachable' }
  | { readonly state: 'unreadable' };
export type OperatorWriteAnswer<T> = { readonly state: 'ok'; readonly value: T } | OperatorWriteFailure;

const UNTYPED: OperatorApiErrorV1 = Object.freeze({ code: '', message: '', next_action: '' });

/** Every write route of the console goes through here. The write token travels in the HttpOnly cookie the page response set; the browser adds Origin and Sec-Fetch-Site. */
export async function postOperatorWrite<T>(path: string, body: unknown, decode: (value: unknown) => T): Promise<OperatorWriteAnswer<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST', cache: 'no-store', credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { state: 'unreachable' };
  }
  const payload: unknown = await response.json().catch(() => null);
  if (response.ok) {
    try { return { state: 'ok', value: decode(payload) }; } catch { return { state: 'unreadable' }; }
  }
  const error = asApiError(payload, UNTYPED);
  if (error === UNTYPED) return { state: 'unreachable' };
  if (response.status === 403 && error.code === 'write_token_invalid') return { state: 'reload_required' };
  const retry = (payload as { readonly retry_after_seconds?: unknown }).retry_after_seconds;
  return { state: 'refused', status: response.status, error, ...(typeof retry === 'number' ? { retry_after_seconds: retry } : {}) };
}

/** No action button: a retry from this page sends the same token, and the reload stays the owner's choice. */
export function WriteReloadBanner({ t }: { readonly t: OperatorTranslate }) {
  return <Banner variant="error" data-write-reload title={t('write.reload.title')} description={t('write.reload.body')} />;
}
