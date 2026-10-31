import { useCallback, useRef, useState } from 'react';
import {
  AGENT_USES,
  decodeAgentsSettings,
  decodeAgentsSettingsResult,
  type AgentUse,
  type AgentsConfigV1,
  type AgentsSettingsChangeV1,
  type AgentsSettingsRequestV1,
  type AgentsSettingsResultV1,
  type AgentsSettingsV1,
} from '../core/operator/agents-settings';
import { asApiError } from './fleet-api';
import type { OperatorApiErrorV1 } from './types';
import { useObservationRefresh } from './useObservationRefresh';

/**
 * Browser side of `GET` and `POST /api/v1/settings/agents`. The page edits a
 * local draft of the `agents` section; Save sends every difference from the
 * section it read as one request, bound to that read's revision.
 */
const AGENTS_SETTINGS_PATH = '/api/v1/settings/agents';

export type AgentsSettingsReason = 'config_invalid' | 'settings_invalid' | 'unreachable';
export type AgentsSettingsRead =
  | { readonly state: 'ok'; readonly settings: AgentsSettingsV1 }
  | { readonly state: 'unavailable'; readonly reason: AgentsSettingsReason };
export type AgentsSettingsReader = (signal: AbortSignal) => Promise<AgentsSettingsRead>;

export async function fetchAgentsSettings(signal: AbortSignal): Promise<AgentsSettingsRead> {
  let response: Response;
  try {
    response = await fetch(AGENTS_SETTINGS_PATH, { signal, cache: 'no-store', headers: { Accept: 'application/json' } });
  } catch (error) {
    if (signal.aborted) throw error;
    return { state: 'unavailable', reason: 'unreachable' };
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) return { state: 'unavailable', reason: asApiError(body).code === 'config_invalid' ? 'config_invalid' : 'unreachable' };
  try { return { state: 'ok', settings: decodeAgentsSettings(body) }; } catch { return { state: 'unavailable', reason: 'settings_invalid' }; }
}

/** The runtimes enabled with the docs use, and the default docs agent when it is one of them. */
export function docsRuntimes(config: AgentsSettingsV1['config']): { readonly ids: readonly string[]; readonly defaultDocs: string | null } {
  const ids = config.uses.docs.filter(id => config.enabled.includes(id));
  return { ids, defaultDocs: config.default_docs !== null && ids.includes(config.default_docs) ? config.default_docs : null };
}

export type AgentsSettingsPost = AgentsSettingsRequestV1 & { readonly request_id: string };

/**
 * `unreachable`: no typed answer arrived, so the request may or may not have
 * run; resending the same request_id replays its recorded result.
 * `unreadable`: a 200 whose body failed the decoder; the write ran.
 */
export type AgentsSettingsWrite =
  | { readonly state: 'saved'; readonly result: AgentsSettingsResultV1 }
  | { readonly state: 'refused'; readonly status: number; readonly error: OperatorApiErrorV1 }
  | { readonly state: 'unreachable' }
  | { readonly state: 'unreadable' };
export type AgentsSettingsWriter = (body: AgentsSettingsPost) => Promise<AgentsSettingsWrite>;

const UNTYPED: OperatorApiErrorV1 = Object.freeze({ code: '', message: '', next_action: '' });

/** The write token travels in the HttpOnly cookie the page response set; the browser adds Origin and Sec-Fetch-Site. */
export async function postAgentsSettings(body: AgentsSettingsPost): Promise<AgentsSettingsWrite> {
  let response: Response;
  try {
    response = await fetch(AGENTS_SETTINGS_PATH, {
      method: 'POST', cache: 'no-store', credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { state: 'unreachable' };
  }
  const payload: unknown = await response.json().catch(() => null);
  if (response.ok) {
    try { return { state: 'saved', result: decodeAgentsSettingsResult(payload) }; } catch { return { state: 'unreadable' }; }
  }
  const error = asApiError(payload, UNTYPED);
  return error === UNTYPED ? { state: 'unreachable' } : { state: 'refused', status: response.status, error };
}

/** The editable copy of the `agents` section. Lists stay sorted, as the stored section is. */
export interface AgentsDraft {
  readonly enabled: readonly string[];
  readonly docs: readonly string[];
  readonly review: readonly string[];
  readonly default_docs: string | null;
}

export function draftOf(config: AgentsConfigV1): AgentsDraft {
  return { enabled: config.enabled, docs: config.uses.docs, review: config.uses.review, default_docs: config.default_docs };
}

const toggled = (ids: readonly string[], id: string, on: boolean): readonly string[] =>
  on ? (ids.includes(id) ? ids : [...ids, id].sort()) : ids.filter(item => item !== id);

/** Turning a runtime off also drops its uses and, when it was the default, the default. */
export function setEnabled(draft: AgentsDraft, runtime: string, on: boolean): AgentsDraft {
  if (on) return { ...draft, enabled: toggled(draft.enabled, runtime, true) };
  return {
    enabled: toggled(draft.enabled, runtime, false),
    docs: toggled(draft.docs, runtime, false),
    review: toggled(draft.review, runtime, false),
    default_docs: draft.default_docs === runtime ? null : draft.default_docs,
  };
}

export function setUse(draft: AgentsDraft, runtime: string, use: AgentUse, on: boolean): AgentsDraft {
  if (use === 'review') return { ...draft, review: toggled(draft.review, runtime, on) };
  return { ...draft, docs: toggled(draft.docs, runtime, on), default_docs: !on && draft.default_docs === runtime ? null : draft.default_docs };
}

export function setDefaultDocs(draft: AgentsDraft, runtime: string | null): AgentsDraft {
  return { ...draft, default_docs: runtime };
}

function runtimeState(draft: AgentsDraft, runtime: string): AgentsSettingsChangeV1 {
  return {
    runtime,
    enabled: draft.enabled.includes(runtime),
    uses: AGENT_USES.filter(use => (use === 'docs' ? draft.docs : draft.review).includes(runtime)),
  };
}

/**
 * The request body for every difference between the draft and the section it
 * was made from, or null when there is none. A runtime that is off on both
 * sides has no uses on either, so only enabled runtimes can differ.
 */
export function draftRequest(base: AgentsSettingsV1['config'], draft: AgentsDraft): AgentsSettingsRequestV1 | null {
  const before = draftOf(base);
  const runtimes = [...new Set([...before.enabled, ...draft.enabled])].sort();
  const changes = runtimes
    .map(runtime => ({ old: runtimeState(before, runtime), next: runtimeState(draft, runtime) }))
    .filter(({ old, next }) => old.enabled !== next.enabled || old.uses.join() !== next.uses.join())
    .map(({ next }) => next);
  const defaultChanged = before.default_docs !== draft.default_docs;
  if (changes.length === 0 && !defaultChanged) return null;
  return defaultChanged
    ? { expected_revision: base.revision, changes, default_docs_runtime: draft.default_docs }
    : { expected_revision: base.revision, changes };
}

/** Codes after which a resend with the same request_id is the documented recovery. Every write of the channel shares them. */
export const RETRY_SAME_REQUEST: ReadonlySet<string> = new Set(['busy', 'audit_unavailable', 'body_timeout']);
/** Codes after which the form must re-read the settings before another save. */
const RELOAD_REQUIRED = new Set(['revision_conflict', 'reconcile_required']);

export type AgentsSaveState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'saved'; readonly changed: number }
  | { readonly kind: 'refused'; readonly status: number; readonly error: OperatorApiErrorV1 }
  | { readonly kind: 'unreachable' }
  | { readonly kind: 'unreadable' };

/** A save outcome that leaves the draft unusable until the settings are read again. */
export function saveNeedsReload(save: AgentsSaveState): boolean {
  return save.kind === 'unreadable' || (save.kind === 'refused' && RELOAD_REQUIRED.has(save.error.code));
}

export type AgentsSettingsView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'unavailable'; readonly reason: AgentsSettingsReason }
  | { readonly kind: 'ready'; readonly settings: AgentsSettingsV1; readonly refreshFailed: boolean };

export interface AgentsSettingsForm {
  readonly view: AgentsSettingsView;
  /** The section the draft was made from; a newer read replaces it only while the draft is unchanged. */
  readonly base: AgentsSettingsV1['config'] | null;
  readonly draft: AgentsDraft | null;
  readonly request: AgentsSettingsRequestV1 | null;
  readonly save: AgentsSaveState;
  readonly edit: (change: (draft: AgentsDraft) => AgentsDraft) => void;
  readonly discard: () => void;
  readonly submit: () => void;
  /** Reads again and starts the draft from that read. */
  readonly reload: () => void;
}

const sameDraft = (left: AgentsDraft, right: AgentsDraft): boolean =>
  left.default_docs === right.default_docs && left.enabled.join() === right.enabled.join()
  && left.docs.join() === right.docs.join() && left.review.join() === right.review.join();

interface FormState {
  readonly view: AgentsSettingsView;
  readonly base: AgentsSettingsV1['config'] | null;
  readonly draft: AgentsDraft | null;
  readonly save: AgentsSaveState;
}

/** Reads only while the Settings page shows. */
export function useAgentsSettingsForm(read: AgentsSettingsReader, write: AgentsSettingsWriter, generation: number, enabled: boolean): AgentsSettingsForm {
  const [state, setState] = useState<FormState>({ view: { kind: 'loading' }, base: null, draft: null, save: { kind: 'idle' } });
  const adoptNextRead = useRef(false);
  // A read that started before a save succeeded can carry the section from before the write.
  const readsStarted = useRef(0);
  const staleReadsThrough = useRef(0);
  // The request_id of the last unanswered or retryable send, bound to its exact body.
  const pending = useRef<{ readonly body: string; readonly id: string } | null>(null);

  const observe = useCallback(async (signal: AbortSignal): Promise<boolean> => {
    const started = ++readsStarted.current;
    const result = await read(signal);
    if (signal.aborted) return false;
    if (started <= staleReadsThrough.current) return true;
    if (result.state !== 'ok') {
      setState(current => ({ ...current, view: current.view.kind === 'ready' ? { ...current.view, refreshFailed: true } : { kind: 'unavailable', reason: result.reason } }));
      return result.reason !== 'unreachable';
    }
    const forced = adoptNextRead.current;
    adoptNextRead.current = false;
    setState((current) => {
      const view: AgentsSettingsView = { kind: 'ready', settings: result.settings, refreshFailed: false };
      const latest = result.settings.config;
      const adopt = forced || current.base === null || current.draft === null
        || (!saveNeedsReload(current.save) && current.save.kind !== 'saving' && sameDraft(current.draft, draftOf(current.base)));
      if (!adopt) return { ...current, view };
      return { view, base: latest, draft: draftOf(latest), save: forced ? { kind: 'idle' } : current.save };
    });
    return true;
  }, [read]);
  const readNow = useObservationRefresh(observe, JSON.stringify(['settings-agents', generation]), { enabled });

  const request = state.base && state.draft ? draftRequest(state.base, state.draft) : null;

  const edit = useCallback((change: (draft: AgentsDraft) => AgentsDraft) => {
    // A changed draft is a new request, so an earlier result no longer describes it.
    setState(current => current.draft === null || saveNeedsReload(current.save) || current.save.kind === 'saving'
      ? current : { ...current, draft: change(current.draft), save: { kind: 'idle' } });
  }, []);

  const discard = useCallback(() => {
    setState(current => current.base === null ? current : { ...current, draft: draftOf(current.base), save: { kind: 'idle' } });
  }, []);

  const reload = useCallback(() => {
    adoptNextRead.current = true;
    pending.current = null;
    readNow();
  }, [readNow]);

  const submit = useCallback(() => {
    if (request === null || state.save.kind === 'saving' || saveNeedsReload(state.save)) return;
    const body = JSON.stringify(request);
    const id = pending.current?.body === body ? pending.current.id : crypto.randomUUID();
    pending.current = { body, id };
    const draft = state.draft!;
    setState(current => ({ ...current, save: { kind: 'saving' } }));
    void write({ request_id: id, ...request }).then((outcome) => {
      if (outcome.state === 'saved') {
        pending.current = null;
        staleReadsThrough.current = readsStarted.current;
        // The server applied exactly this draft to the read it was made from.
        setState(current => ({
          ...current,
          base: { revision: outcome.result.config_revision, enabled: draft.enabled, uses: { docs: draft.docs, review: draft.review }, default_docs: draft.default_docs },
          draft,
          save: { kind: 'saved', changed: outcome.result.changed_keys.length },
        }));
        readNow();
        return;
      }
      if (outcome.state === 'refused' && !RETRY_SAME_REQUEST.has(outcome.error.code)) pending.current = null;
      setState(current => ({
        ...current,
        save: outcome.state === 'refused' ? { kind: 'refused', status: outcome.status, error: outcome.error } : { kind: outcome.state },
      }));
    });
  }, [request, state.save, state.draft, write, readNow]);

  return { view: state.view, base: state.base, draft: state.draft, request, save: state.save, edit, discard, submit, reload };
}
