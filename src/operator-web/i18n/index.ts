import { useCallback, useEffect, useState } from 'react';
import * as runtime from './runtime';
import * as task from './task';
import * as shell from './shell';
import * as board from './board';
import * as repositories from './repositories';
import * as architecture from './architecture';
import * as docs from './docs';
import * as tools from './tools';
import * as setup from './setup';
import * as cli from './cli';
import * as home from './home';
import * as tests from './tests';
import * as system from './system';
import * as worktrees from './worktrees';
import * as skills from './skills';
import * as settings from './settings';
import * as bots from './bots';

/**
 * The operator board ships its own dictionary instead of an i18n library: the
 * surface is one page, the key set is closed, and a third-party runtime would
 * add a dependency to a bundle that must stay auditable. Each module in this
 * directory holds the `en` and `zh` parts of one page or shared area, and each
 * `zh` part is typed against its own `en` keys, so a missing or extra
 * translation is a typecheck failure rather than a runtime fallback. A key
 * prefix belongs to one module only: the spreads below would hide a duplicate.
 */
export type OperatorLocale = 'en' | 'zh';

export const OPERATOR_LOCALES: readonly OperatorLocale[] = ['en', 'zh'];
export const DEFAULT_OPERATOR_LOCALE: OperatorLocale = 'en';
export const OPERATOR_LOCALE_STORAGE_KEY = 'repo-harness:operator-locale';

const en = {
  ...runtime.en,
  ...task.en,
  ...shell.en,
  ...board.en,
  ...repositories.en,
  ...architecture.en,
  ...docs.en,
  ...tools.en,
  ...setup.en,
  ...cli.en,
  ...home.en,
  ...tests.en,
  ...system.en,
  ...worktrees.en,
  ...skills.en,
  ...settings.en,
  ...bots.en,
};

export type OperatorMessageKey = keyof typeof en;

/**
 * The dictionary is a closed key set. A code-derived lookup that misses is a
 * miss, not a silent fallback, so the caller can state that what it renders is
 * the server's own sentence rather than board copy.
 */
export function isOperatorMessageKey(value: string): value is OperatorMessageKey {
  return Object.hasOwn(en, value);
}

const zh: Readonly<Record<OperatorMessageKey, string>> = {
  ...runtime.zh,
  ...task.zh,
  ...shell.zh,
  ...board.zh,
  ...repositories.zh,
  ...architecture.zh,
  ...docs.zh,
  ...tools.zh,
  ...setup.zh,
  ...cli.zh,
  ...home.zh,
  ...tests.zh,
  ...system.zh,
  ...worktrees.zh,
  ...skills.zh,
  ...settings.zh,
  ...bots.zh,
};

const dictionaries: Readonly<Record<OperatorLocale, Readonly<Record<OperatorMessageKey, string>>>> = {
  en,
  zh,
};

export type OperatorMessageParams = Readonly<Record<string, string | number>>;

/** Substitution is positional-free and total: an unknown placeholder stays literal. */
export function translate(
  locale: OperatorLocale,
  key: OperatorMessageKey,
  params?: OperatorMessageParams,
): string {
  const template = dictionaries[locale][key];
  if (!params) return template;
  return template.replaceAll(/\{(\w+)\}/gu, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export type OperatorTranslate = (key: OperatorMessageKey, params?: OperatorMessageParams) => string;

export function isOperatorLocale(value: unknown): value is OperatorLocale {
  return value === 'en' || value === 'zh';
}

/** `zh-CN`, `zh-Hant`, and bare `zh` all resolve to the Chinese dictionary. */
export function localeFromNavigatorLanguage(language: string | null | undefined): OperatorLocale | null {
  if (typeof language !== 'string') return null;
  const primary = language.trim().toLowerCase().split('-')[0];
  if (primary === 'zh') return 'zh';
  if (primary === 'en') return 'en';
  return null;
}

function localStorageOrNull(): Storage | null {
  try {
    const scope = globalThis as { localStorage?: Storage; window?: { localStorage?: Storage } };
    return scope.localStorage ?? scope.window?.localStorage ?? null;
  } catch {
    return null;
  }
}

function navigatorLanguage(): string | null {
  try {
    const scope = globalThis as { navigator?: { language?: string } };
    return scope.navigator?.language ?? null;
  } catch {
    return null;
  }
}

export function readStoredLocale(storage: Storage | null = localStorageOrNull()): OperatorLocale | null {
  if (!storage) return null;
  try {
    const stored = storage.getItem(OPERATOR_LOCALE_STORAGE_KEY);
    return isOperatorLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function writeStoredLocale(
  locale: OperatorLocale,
  storage: Storage | null = localStorageOrNull(),
): void {
  if (!storage) return;
  try {
    storage.setItem(OPERATOR_LOCALE_STORAGE_KEY, locale);
  } catch {
    // A blocked or full storage must never break the board.
  }
}

/** Stored choice wins over the browser language; both fail closed to `en`. */
export function resolveInitialLocale(options: {
  readonly stored?: OperatorLocale | null;
  readonly language?: string | null;
} = {}): OperatorLocale {
  const stored = options.stored === undefined ? readStoredLocale() : options.stored;
  if (stored) return stored;
  const language = options.language === undefined ? navigatorLanguage() : options.language;
  return localeFromNavigatorLanguage(language) ?? DEFAULT_OPERATOR_LOCALE;
}

export interface OperatorLocaleController {
  readonly locale: OperatorLocale;
  readonly setLocale: (locale: OperatorLocale) => void;
  readonly t: OperatorTranslate;
}

export function useLocale(initial?: OperatorLocale): OperatorLocaleController {
  const [locale, setLocaleState] = useState<OperatorLocale>(() => initial ?? resolveInitialLocale());
  const setLocale = useCallback((next: OperatorLocale) => {
    setLocaleState(next);
    writeStoredLocale(next);
  }, []);
  // The document language is a projection of this locale. The app subtree
  // already carries the same value; this keeps the document in step with it.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const t = useCallback<OperatorTranslate>((key, params) => translate(locale, key, params), [locale]);
  return { locale, setLocale, t };
}

export interface RelativeAge {
  readonly key: Extract<OperatorMessageKey, `age.${string}`>;
  readonly count: number;
}

/**
 * Data age is computed in the browser from `observed_at`; the snapshot carries
 * no duration of its own, so nothing here is invented beyond the clock read.
 */
export function relativeAge(observedAt: string, now: number): RelativeAge | null {
  const observed = Date.parse(observedAt);
  if (Number.isNaN(observed)) return null;
  const seconds = Math.max(0, Math.floor((now - observed) / 1000));
  if (seconds < 60) return { key: 'age.seconds', count: seconds };
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return { key: 'age.minutes', count: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { key: 'age.hours', count: hours };
  return { key: 'age.days', count: Math.floor(hours / 24) };
}

export function formatRelativeAge(observedAt: string, now: number, t: OperatorTranslate): string {
  const age = relativeAge(observedAt, now);
  if (!age) return t('status.observedUnknown');
  return t('status.observedAgo', { age: t(age.key, { count: age.count }) });
}
