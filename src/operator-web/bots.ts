import { useCallback, useState } from 'react';
import { decodeBotAccessSnapshot, type BotAccessSnapshotV1, type BotAttribution } from '../core/operator/bot-access';
import { asApiError } from './fleet-api';
import { useObservationRefresh } from './useObservationRefresh';

/**
 * Browser side of `GET /api/v1/bot-access`. The server collects MCP, the
 * notify plugin and Herdr in the background and caches one snapshot. Its notify
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
export type BotAccessView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'unavailable'; readonly reason: BotAccessReason }
  | { readonly kind: 'ready'; readonly snapshot: BotAccessSnapshotV1; readonly refreshFailed: boolean };

/** Reads only while the Bots page shows; a return to the page reads at once. */
export function useBotAccess(read: BotAccessReader, generation: number, enabled: boolean): BotAccessView {
  const [view, setView] = useState<BotAccessView>({ kind: 'loading' });
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
  useObservationRefresh(observe, JSON.stringify(['bot-access', generation]), { enabled });
  return view;
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
/** `herdr notify install` needs the session; without an install record the session is unknown. */
export const notifyInstallCommand = (session: string | null): string => `repo-harness herdr notify install --session ${session ?? '<session>'}`;
