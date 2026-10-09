import { useCallback, useEffect, useState } from 'react';

/**
 * Light and dark follow the system until the operator picks one. Kumo reads
 * the resolved mode from `<html data-mode>`; the stored choice is a browser
 * preference only, so blocked storage falls back to following the system.
 */
export type ThemePreference = 'system' | 'light' | 'dark';
export type ThemeMode = 'light' | 'dark';

export const OPERATOR_THEME_STORAGE_KEY = 'repo-harness:operator-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

export function readStoredTheme(): ThemePreference {
  try {
    const stored = globalThis.localStorage?.getItem(OPERATOR_THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

function writeStoredTheme(preference: ThemePreference): void {
  try {
    if (preference === 'system') globalThis.localStorage?.removeItem(OPERATOR_THEME_STORAGE_KEY);
    else globalThis.localStorage?.setItem(OPERATOR_THEME_STORAGE_KEY, preference);
  } catch {
    // Blocked storage keeps the choice for this page only.
  }
}

function systemPrefersDark(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
}

export function resolveThemeMode(preference: ThemePreference, prefersDark: boolean): ThemeMode {
  return preference === 'system' ? (prefersDark ? 'dark' : 'light') : preference;
}

/** Sets the attribute Kumo's `light-dark()` tokens key on. */
export function applyThemeMode(mode: ThemeMode): void {
  if (typeof document !== 'undefined') document.documentElement.setAttribute('data-mode', mode);
}

/** The order the single toggle cycles through. */
const NEXT: Readonly<Record<ThemePreference, ThemePreference>> = { system: 'light', light: 'dark', dark: 'system' };

export function useTheme(): { readonly preference: ThemePreference; readonly mode: ThemeMode; readonly cycle: () => void } {
  const [preference, setPreference] = useState<ThemePreference>(readStoredTheme);
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    let query: MediaQueryList;
    try { query = window.matchMedia(DARK_QUERY); } catch { return; }
    const changed = () => setPrefersDark(query.matches);
    query.addEventListener?.('change', changed);
    return () => query.removeEventListener?.('change', changed);
  }, []);
  const mode = resolveThemeMode(preference, prefersDark);
  useEffect(() => applyThemeMode(mode), [mode]);
  const cycle = useCallback(() => setPreference(current => {
    const next = NEXT[current];
    writeStoredTheme(next);
    return next;
  }), []);
  return { preference, mode, cycle };
}
