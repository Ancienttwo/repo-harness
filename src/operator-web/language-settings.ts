import { useCallback, useEffect, useRef, useState } from 'react';
import { readJson } from './json-read';
import { asApiError, type OperatorApiErrorV1 } from './operator-api-error';
import { postOperatorWrite, type OperatorWriteAnswer } from './operator-write';

/**
 * Browser side of the language routes: `/api/v1/settings/report-language`
 * (user reporting language of the global rules files) and
 * `/api/v1/repositories/<id>/documentation-language`. The console UI locale
 * (`useLocale`) is a separate setting and never reaches these routes.
 */
export const REPORTING_PRESETS = ['follow', 'zh-CN', 'en'] as const;
export type ReportingPreset = (typeof REPORTING_PRESETS)[number];
export const DOCUMENTATION_LANGUAGES = ['en', 'zh-CN', 'follow-user'] as const;
export type DocumentationLanguage = (typeof DOCUMENTATION_LANGUAGES)[number];

export interface ReportingHost {
  readonly host: string;
  /** A global-context state, or `unsafe` / `unreadable` when the rules file cannot be judged. */
  readonly state: string;
  readonly preset: ReportingPreset | 'custom' | null;
}

export type LanguageRead<R> =
  | { readonly state: 'ok'; readonly value: R }
  | { readonly state: 'refused'; readonly error: OperatorApiErrorV1 }
  | { readonly state: 'unreachable' }
  | { readonly state: 'invalid' };
export type LanguageReader<R> = (signal: AbortSignal) => Promise<LanguageRead<R>>;
export type LanguageWriter<C extends string> = (choice: C, requestId: string) => Promise<OperatorWriteAnswer<unknown>>;

const UNTYPED: OperatorApiErrorV1 = Object.freeze({ code: '', message: '', next_action: '' });
const isOneOf = <T extends string>(values: readonly T[], value: unknown): value is T => values.includes(value as T);

function decodeReportingHosts(value: unknown): readonly ReportingHost[] {
  const hosts = (value as { readonly hosts?: unknown } | null)?.hosts;
  if (!Array.isArray(hosts)) throw new Error('hosts must be a list');
  return hosts.map((item: { readonly host?: unknown; readonly state?: unknown; readonly preset?: unknown }) => {
    if (typeof item.host !== 'string' || typeof item.state !== 'string') throw new Error('host entry is malformed');
    if (item.preset !== null && item.preset !== 'custom' && !isOneOf(REPORTING_PRESETS, item.preset)) throw new Error('preset is unknown');
    return { host: item.host, state: item.state, preset: item.preset };
  });
}

function decodeDocumentationLanguage(value: unknown): DocumentationLanguage | null {
  const language = (value as { readonly language?: unknown } | null)?.language;
  if (language === null) return null;
  if (!isOneOf(DOCUMENTATION_LANGUAGES, language)) throw new Error('language is unknown');
  return language;
}

async function fetchLanguage<R>(path: string, decode: (value: unknown) => R, signal: AbortSignal): Promise<LanguageRead<R>> {
  const answer = await readJson(path, signal);
  if (answer.state === 'unreachable') return answer;
  const { body } = answer;
  if (!answer.ok) {
    const error = asApiError(body, UNTYPED);
    return error === UNTYPED ? { state: 'unreachable' } : { state: 'refused', error };
  }
  try { return { state: 'ok', value: decode(body) }; } catch { return { state: 'invalid' }; }
}

const REPORT_LANGUAGE_PATH = '/api/v1/settings/report-language';
const documentationPath = (repositoryId: string) => `/api/v1/repositories/${encodeURIComponent(repositoryId)}/documentation-language`;

export const fetchReportingLanguage: LanguageReader<readonly ReportingHost[]> = signal => fetchLanguage(REPORT_LANGUAGE_PATH, decodeReportingHosts, signal);
export const postReportingLanguage: LanguageWriter<ReportingPreset> = (preset, requestId) =>
  postOperatorWrite(REPORT_LANGUAGE_PATH, { request_id: requestId, preset }, value => {
    if (!Array.isArray((value as { readonly changed_hosts?: unknown } | null)?.changed_hosts)) throw new Error('changed_hosts must be a list');
    return value;
  });

export type DocumentationLanguageReader = (repositoryId: string) => LanguageReader<DocumentationLanguage | null>;
export type DocumentationLanguageWriter = (repositoryId: string) => LanguageWriter<DocumentationLanguage>;
export const fetchDocumentationLanguage: DocumentationLanguageReader = repositoryId => signal => fetchLanguage(documentationPath(repositoryId), decodeDocumentationLanguage, signal);
export const postDocumentationLanguage: DocumentationLanguageWriter = repositoryId => (language, requestId) =>
  postOperatorWrite(documentationPath(repositoryId), { request_id: requestId, language }, value => {
    decodeDocumentationLanguage(value);
    return value;
  });

export type LanguageSave =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'saved' }
  | { readonly kind: 'refused'; readonly error: OperatorApiErrorV1 }
  | { readonly kind: 'reload_required' }
  | { readonly kind: 'unreachable' }
  | { readonly kind: 'unreadable' };

export interface LanguageControl<R, C extends string> {
  /** `null` until the first read answers. */
  readonly read: LanguageRead<R> | null;
  readonly save: LanguageSave;
  readonly choose: (choice: C) => void;
}

/**
 * One read on mount and on `generation`, and a read after every write that
 * reached the service. An unanswered write resends the same request_id.
 */
export function useLanguageControl<R, C extends string>(read: LanguageReader<R>, write: LanguageWriter<C>, generation: number): LanguageControl<R, C> {
  const [view, setView] = useState<LanguageRead<R> | null>(null);
  const [save, setSave] = useState<LanguageSave>({ kind: 'idle' });
  const [reads, setReads] = useState(0);
  const pending = useRef<{ readonly choice: C; readonly id: string } | null>(null);
  const saving = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    read(controller.signal).then(
      answer => { if (!controller.signal.aborted) setView(current => (answer.state !== 'ok' && current?.state === 'ok' ? current : answer)); },
      () => {},
    );
    return () => controller.abort();
  }, [read, generation, reads]);

  const choose = useCallback((choice: C) => {
    if (saving.current) return;
    saving.current = true;
    const id = pending.current?.choice === choice ? pending.current.id : crypto.randomUUID();
    pending.current = { choice, id };
    setSave({ kind: 'saving' });
    void write(choice, id).then((outcome) => {
      saving.current = false;
      if (outcome.state !== 'unreachable') pending.current = null;
      setSave(outcome.state === 'ok' ? { kind: 'saved' } : outcome.state === 'refused' ? { kind: 'refused', error: outcome.error } : { kind: outcome.state });
      if (outcome.state !== 'reload_required') setReads(count => count + 1);
    });
  }, [write]);

  return { read: view, save, choose };
}
