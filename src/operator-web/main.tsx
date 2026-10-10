import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { OperatorApp, type OperatorAppProps } from './App';
import { applyThemeMode, readStoredTheme, resolveThemeMode } from './theme';
import './app.css';

// Resolve the mode before the first paint so a dark system does not flash light.
applyThemeMode(resolveThemeMode(readStoredTheme(), typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches));

const root = document.getElementById('root');
if (!root) throw new Error('operator web root element is missing');

/**
 * `?fixture=<name>` exists only in the Vite dev server. The production build
 * replaces `import.meta.env.DEV` with `false`, so the fixture chunk is never
 * emitted. The parameter is removed from the URL because Task links accept no
 * other query keys.
 */
async function developmentProps(): Promise<OperatorAppProps> {
  if (import.meta.env.DEV) {
    const params = new URLSearchParams(window.location.search);
    const name = params.get('fixture');
    if (name !== null) {
      params.delete('fixture');
      const query = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : '') + window.location.hash);
      const { fixtureProps } = await import('./fixtures');
      return fixtureProps(name);
    }
  }
  return {};
}

void developmentProps().then(props => {
  createRoot(root).render(
    <StrictMode>
      <OperatorApp {...props} />
    </StrictMode>,
  );
});
