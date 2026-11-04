import { useCallback, useRef, useState } from 'react';
import {
  AGENT_USES,
  decodeAgentsSettings,
  decodeAgentsSettingsResult,
  type AgentUse,
  type AgentsConfigV1,
  type AgentsSettingsChangeV1,
  type AgentsSettingsRequestV1,
  type AgentsSettingsV1,
} from '../core/operator/agents-settings';
import { asApiError } from './operator-api-error';
import type { OperatorApiErrorV1 } from './operator-api-error';
import { postOperatorWrite, type OperatorWriteFailure } from './operator-write';
import { useObservationRefresh } from './useObservationRefresh';

/**
 * Browser side of `GET` and `POST /api/v1/settings/<section>`. A page edits a
 * local draft of one config section; Save sends every difference from the
 * section it read as one request, bound to that read's revision.
 */
const AGENTS_SETTINGS_PATH = '/api/v1/settings/agents';

export type SettingsReason = 'config_invalid' | 'settings_invalid' | 'unreachable';
export type SettingsRead<S> =
  | { readonly state: 'ok'; readonly settings: S }
  | { readonly state: 'unavailable'; readonly reason: SettingsReason };
export type SettingsReader<S> = (signal: AbortSignal) => Promise<SettingsRead<S>>;
export type AgentsSettingsRead = SettingsRead<AgentsSettingsV1>;
export type AgentsSettingsReader = SettingsReader<AgentsSettingsV1>;

export async function fetchSettings<S>(path: string, decode: (value: unknown) => S, signal: AbortSignal): Promise<SettingsRead<S>> {
  let response: Response;
  try {
    response = await fetch(path, { signal, cache: 'no-store', headers: { Accept: 'application/json' } });
  } catch (error) {
    if (signal.aborted) throw error;
    return { state: 'unavailable', reason: 'unreachable' };
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) return { state: 'unavailable', reason: asApiError(body).code === 'config_invalid' ? 'config_invalid' : 'unreachable' };
  try { return { state: 'ok', settings: decode(body) }; } catch { return { state: 'unavailable', reason: 'settings_invalid' }; }
}

export const fetchAgentsSettings: AgentsSettingsReader = signal => fetchSettings(AGENTS_SETTINGS_PATH, decodeAgentsSettings, signal);

/** Both sections answer a save with the new revision and the config keys whose value changed. */
export interface SettingsResult {
  readonly config_revision: string;
  readonly changed_keys: readonly string[];
}

export type AgentsSettingsPost = AgentsSettingsRequestV1 & { readonly request_id: string };

/** After `unreachable`, resending the same request_id replays the recorded result. */
export type SettingsWrite = { readonly state: 'saved'; readonly result: SettingsResult } | OperatorWriteFailure;
export type SettingsWriter<R> = (body: R & { readonly request_id: string }) => Promise<SettingsWrite>;
export type AgentsSettingsWrite = SettingsWrite;
export type AgentsSettingsWriter = SettingsWriter<AgentsSettingsRequestV1>;

export async function postSettings(path: string, decodeResult: (value: unknown) => SettingsResult, body: unknown): Promise<SettingsWrite> {
  const answer = await postOperatorWrite(path, body, decodeResult);
  return answer.state === 'ok' ? { state: 'saved', result: answer.value } : answer;
}

export const postAgentsSettings: AgentsSettingsWriter = body => postSettings(AGENTS_SETTINGS_PATH, decodeAgentsSettingsResult, body);

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

/** Codes after which a resend with the same request_id is the documented recovery. */
const RETRY_SAME_REQUEST = new Set(['busy', 'audit_unavailable', 'body_timeout']);
/** Codes after which the form must re-read the settings before another save. */
const RELOAD_REQUIRED = new Set(['revision_conflict', 'reconcile_required']);

export type SettingsSaveState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'saved'; readonly changed: number }
  | { readonly kind: 'refused'; readonly status: number; readonly error: OperatorApiErrorV1 }
  | { readonly kind: 'reload_required' }
  | { readonly kind: 'unreachable' }
  | { readonly kind: 'unreadable' };

/** A save outcome that leaves the draft unusable until the settings or the page are read again. */
export function saveNeedsReload(save: SettingsSaveState): boolean {
  return save.kind === 'unreadable' || save.kind === 'reload_required' || (save.kind === 'refused' && RELOAD_REQUIRED.has(save.error.code));
}

export type SettingsView<S> =
  | { readonly kind: 'loading' }
  | { readonly kind: 'unavailable'; readonly reason: SettingsReason }
  | { readonly kind: 'ready'; readonly settings: S; readonly refreshFailed: boolean };
export type AgentsSettingsView = SettingsView<AgentsSettingsV1>;

export interface SettingsForm<S, C, D, R> {
  readonly view: SettingsView<S>;
  /** The section the draft was made from; a newer read replaces it only while the draft is unchanged. */
  readonly base: C | null;
  readonly draft: D | null;
  readonly request: R | null;
  readonly save: SettingsSaveState;
  /** Successful saves; the other section on the same file reads again after each one. */
  readonly saves: number;
  readonly edit: (change: (draft: D) => D) => void;
  readonly discard: () => void;
  readonly submit: () => void;
  /** Reads again and starts the draft from that read. */
  readonly reload: () => void;
}
export type AgentsSettingsForm = SettingsForm<AgentsSettingsV1, AgentsSettingsV1['config'], AgentsDraft, AgentsSettingsRequestV1>;

/** How one section maps between its read, its draft and its request. */
export interface SettingsSection<S, C extends { readonly revision: string }, D, R> {
  /** Names the observation refresh key. */
  readonly id: string;
  readonly config: (settings: S) => C;
  readonly draftOf: (config: C) => D;
  readonly request: (base: C, draft: D) => R | null;
  readonly sameDraft: (left: D, right: D) => boolean;
  /** The section after the server applied exactly this draft. */
  readonly applied: (revision: string, draft: D) => C;
}

interface FormState<S, C, D> {
  readonly view: SettingsView<S>;
  readonly base: C | null;
  readonly draft: D | null;
  readonly save: SettingsSaveState;
  readonly saves: number;
}

/**
 * Reads only while the page shows. Both sections live in one file with one
 * revision, so `sharedSaves` (the saves of the other section) starts a new read.
 */
export function useSettingsForm<S, C extends { readonly revision: string }, D, R>(
  section: SettingsSection<S, C, D, R>, read: SettingsReader<S>, write: SettingsWriter<R>, generation: number, sharedSaves: number, enabled: boolean,
): SettingsForm<S, C, D, R> {
  const [state, setState] = useState<FormState<S, C, D>>({ view: { kind: 'loading' }, base: null, draft: null, save: { kind: 'idle' }, saves: 0 });
  const adoptNextRead = useRef(false);
  // A read that started before a save succeeded can carry the section from before the write.
  const readsStarted = useRef(0);
  const staleReadsThrough = useRef(0);
  // The request_id of the last unanswered or retryable send, bound to its exact body.
  const pending = useRef<{ readonly body: string; readonly id: string } | null>(null);
  const { config, draftOf, request: requestOf, sameDraft, applied } = section;

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
      const view: SettingsView<S> = { kind: 'ready', settings: result.settings, refreshFailed: false };
      const latest = config(result.settings);
      if (forced || current.base === null || current.draft === null) return { view, base: latest, draft: draftOf(latest), save: forced ? { kind: 'idle' } : current.save, saves: current.saves };
      const open = !saveNeedsReload(current.save) && current.save.kind !== 'saving';
      if (open && sameDraft(current.draft, draftOf(current.base))) return { view, base: latest, draft: draftOf(latest), save: current.save, saves: current.saves };
      // A new revision whose stored section equals the base changed only another section: the edited draft moves to it.
      if (open && sameDraft(draftOf(latest), draftOf(current.base))) return { ...current, view, base: latest };
      return { ...current, view };
    });
    return true;
  }, [read, config, draftOf, sameDraft]);
  const readNow = useObservationRefresh(observe, JSON.stringify([`settings-${section.id}`, generation, sharedSaves]), { enabled });

  const request = state.base && state.draft ? requestOf(state.base, state.draft) : null;

  const edit = useCallback((change: (draft: D) => D) => {
    // A changed draft is a new request, so an earlier result no longer describes it.
    setState(current => current.draft === null || saveNeedsReload(current.save) || current.save.kind === 'saving'
      ? current : { ...current, draft: change(current.draft), save: { kind: 'idle' } });
  }, []);

  const discard = useCallback(() => {
    setState(current => current.base === null ? current : { ...current, draft: draftOf(current.base), save: { kind: 'idle' } });
  }, [draftOf]);

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
        setState(current => ({ ...current, base: applied(outcome.result.config_revision, draft), draft, save: { kind: 'saved', changed: outcome.result.changed_keys.length }, saves: current.saves + 1 }));
        readNow();
        return;
      }
      if (outcome.state === 'refused' && !RETRY_SAME_REQUEST.has(outcome.error.code)) pending.current = null;
      setState(current => ({
        ...current,
        save: outcome.state === 'refused' ? { kind: 'refused', status: outcome.status, error: outcome.error } : { kind: outcome.state },
      }));
    });
  }, [request, state.save, state.draft, write, readNow, applied]);

  return { view: state.view, base: state.base, draft: state.draft, request, save: state.save, saves: state.saves, edit, discard, submit, reload };
}

const sameAgentsDraft = (left: AgentsDraft, right: AgentsDraft): boolean =>
  left.default_docs === right.default_docs && left.enabled.join() === right.enabled.join()
  && left.docs.join() === right.docs.join() && left.review.join() === right.review.join();

const AGENTS_SECTION: SettingsSection<AgentsSettingsV1, AgentsSettingsV1['config'], AgentsDraft, AgentsSettingsRequestV1> = {
  id: 'agents',
  config: settings => settings.config,
  draftOf,
  request: draftRequest,
  sameDraft: sameAgentsDraft,
  applied: (revision, draft) => ({ revision, enabled: draft.enabled, uses: { docs: draft.docs, review: draft.review }, default_docs: draft.default_docs }),
};

export function useAgentsSettingsForm(read: AgentsSettingsReader, write: AgentsSettingsWriter, generation: number, seatsSaves: number, enabled: boolean): AgentsSettingsForm {
  return useSettingsForm(AGENTS_SECTION, read, write, generation, seatsSaves, enabled);
}
