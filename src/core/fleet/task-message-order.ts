/**
 * The task inbox order: newest `created_at` first, then the higher `message_id`.
 * The inbox reader selects with it and every operator view sorts with it. It
 * compares parsed times, because `…00.500Z` is later than `…00Z` but sorts
 * before it as text. This file has no imports, so the browser can load it.
 */
export function newestTaskMessageFirst(left: { readonly created_at: string; readonly message_id: string },
  right: { readonly created_at: string; readonly message_id: string }): number {
  const time = Date.parse(right.created_at) - Date.parse(left.created_at);
  return time !== 0 ? time : left.message_id < right.message_id ? 1 : left.message_id > right.message_id ? -1 : 0;
}
