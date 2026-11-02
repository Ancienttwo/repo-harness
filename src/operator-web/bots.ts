import { useCallback, useState } from 'react';
import { decodeBotAccessSnapshot, type BotAccessSnapshotV1, type BotAttribution } from '../core/operator/bot-access';
import { decodeSlackReviews, type SlackReviewsSnapshotV1 } from '../core/operator/slack-review';
import { asApiError } from './fleet-api';
import { useObservationRefresh } from './useObservationRefresh';

/**
 * Browser side of `GET /api/v1/bot-access`. The server collects MCP, the
 * notify relay and Herdr in the background and caches one snapshot. Its notify
 * section is the notify collector's own cache, so the Bots page reads this one
 * route. Nothing here runs a command or writes.
 */
export type BotAccessReason = 'bot_access_pending' | 'bot_access_unavailable' | 'bot_access_invalid' | 'unreachable';
export type BotAccessRead =
  | { readonly state: 'ok'; readonly snapshot: BotAccessSnapshotV1 }
  | { readonly state: 'unavailable'; readonly reason: BotAccessReason };
export type BotAccessReader = (signal: AbortSignal) => Promise<BotAccessRead>;

const BOT_ACCESS_REASONS: Readonly<Record<Exclude<BotAccessReason, 'unreachable'>, true>> = {
  bot_access_pending: true, bot_access_unavailable: true, bot_access_invalid: true,
};

export async function fetchBotAccess(signal: AbortSignal): Promise<BotAccessRead> {
  let response: Response;
  try {
    response = await fetch('/api/v1/bot-access', { signal, cache: 'no-store', headers: { Accept: 'application/json' } });
  } catch (error) {
    if (signal.aborted) throw error;
    return { state: 'unavailable', reason: 'unreachable' };
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const { code } = asApiError(body);
    return { state: 'unavailable', reason: Object.hasOwn(BOT_ACCESS_REASONS, code) ? code as BotAccessReason : 'unreachable' };
  }
  try { return { state: 'ok', snapshot: decodeBotAccessSnapshot(body) }; } catch { return { state: 'unavailable', reason: 'bot_access_invalid' }; }
}

/** A failed refresh keeps the last snapshot and says so. */
export type BotsReadView<S, R extends string> =
  | { readonly kind: 'loading' }
  | { readonly kind: 'unavailable'; readonly reason: R }
  | { readonly kind: 'ready'; readonly snapshot: S; readonly refreshFailed: boolean };
export type BotAccessView = BotsReadView<BotAccessSnapshotV1, BotAccessReason>;

type BotsRead<S, R extends string> = { readonly state: 'ok'; readonly snapshot: S } | { readonly state: 'unavailable'; readonly reason: R };

/** Reads only while the Bots page shows; a return to the page reads at once. */
function useBotsRead<S, R extends string>(read: (signal: AbortSignal) => Promise<BotsRead<S, R>>, identity: string, enabled: boolean): BotsReadView<S, R> {
  const [view, setView] = useState<BotsReadView<S, R>>({ kind: 'loading' });
  const observe = useCallback(async (signal: AbortSignal): Promise<boolean> => {
    const result = await read(signal);
    if (signal.aborted) return false;
    if (result.state === 'ok') {
      setView({ kind: 'ready', snapshot: result.snapshot, refreshFailed: false });
      return true;
    }
    setView(current => current.kind === 'ready' ? { ...current, refreshFailed: true } : { kind: 'unavailable', reason: result.reason });
    return result.reason !== 'unreachable';
  }, [read]);
  useObservationRefresh(observe, identity, { enabled });
  return view;
}

export function useBotAccess(read: BotAccessReader, generation: number, enabled: boolean): BotAccessView {
  return useBotsRead(read, JSON.stringify(['bot-access', generation]), enabled);
}

/**
 * Browser side of `GET /api/v1/bot-reviews`: the Slack review collector's
 * cache. A Slack failure is the snapshot's own `reason`; the reasons here are
 * only about this read.
 */
export type BotReviewsReason = 'bot_reviews_invalid' | 'unreachable';
export type BotReviewsRead =
  | { readonly state: 'ok'; readonly snapshot: SlackReviewsSnapshotV1 }
  | { readonly state: 'unavailable'; readonly reason: BotReviewsReason };
export type BotReviewsReader = (signal: AbortSignal) => Promise<BotReviewsRead>;
export type BotReviewsView = BotsReadView<SlackReviewsSnapshotV1, BotReviewsReason>;

export async function fetchBotReviews(signal: AbortSignal): Promise<BotReviewsRead> {
  let response: Response;
  try {
    response = await fetch('/api/v1/bot-reviews', { signal, cache: 'no-store', headers: { Accept: 'application/json' } });
  } catch (error) {
    if (signal.aborted) throw error;
    return { state: 'unavailable', reason: 'unreachable' };
  }
  const body: unknown = await response.json().catch(() => null);
  // The route refuses only a snapshot that failed its own decode.
  if (!response.ok) return { state: 'unavailable', reason: asApiError(body).code === 'bot_reviews_invalid' ? 'bot_reviews_invalid' : 'unreachable' };
  try { return { state: 'ok', snapshot: decodeSlackReviews(body) }; } catch { return { state: 'unavailable', reason: 'bot_reviews_invalid' }; }
}

export function useBotReviews(read: BotReviewsReader, generation: number, enabled: boolean): BotReviewsView {
  return useBotsRead(read, JSON.stringify(['bot-reviews', generation]), enabled);
}

/** The Bot a row belongs to. `unknown` means the registry could not be read, so the row is not called unregistered. */
export type BotLabel = { readonly kind: 'registered'; readonly name: string } | { readonly kind: 'unregistered' } | { readonly kind: 'unknown' };

export function botLabel(snapshot: BotAccessSnapshotV1, bot: BotAttribution): BotLabel {
  if (bot.state === 'unregistered') return { kind: 'unregistered' };
  if (bot.state === 'unavailable') return { kind: 'unknown' };
  const record = snapshot.bots.state === 'ok' ? snapshot.bots.bots.find(entry => entry.bot_id === bot.bot_id) : undefined;
  return { kind: 'registered', name: record?.name ?? bot.bot_id };
}

// Access changes are credential and permission operations: the page only gives the command.
export const MCP_DOCTOR_COMMAND = 'repo-harness mcp doctor';
/** `--repo` takes the repository's local path, which the page never shows, so the path stays a placeholder. */
export const MCP_ACCESS_COMMAND = 'repo-harness mcp access set --repo <repo-path> --mode read_only|read_write';
