import { afterEach, beforeEach, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';

import { decodeDevActivitySnapshot } from '../../src/core/dev-activity/decode';
import { docsLines } from '../../src/core/operator/docs';
import { unavailableRuntimeOverlay } from '../../src/core/operator/runtime-status';
import { OperatorApp } from '../../src/operator-web/App';
import { stableSnapshot } from '../../src/operator-web/fixture';
import { busyDevActivity } from '../../src/operator-web/fixtures/dev-activity';
import { docsFileAnswer, docsTreeAnswer } from '../../src/operator-web/fixtures/docs';

// The real pinned Mermaid, not the stand-in of operator-docs-page.test.tsx: its
// failure path appends its own nodes to document.body, outside React.
const REPOSITORY = 'repo-harness';
const BROKEN = 'docs/design/broken-diagram.md';
const BROKEN_TEXT = '# Broken diagram\n\n```mermaid\ngraph LR\n  a["open --> \n```\n';
const NOW = Date.now();
const activity = decodeDevActivitySnapshot(busyDevActivity(NOW));

let root: Root | null = null;
let window: Window;
const realFetch = globalThis.fetch;

function answer(url: URL) {
  if (url.pathname.endsWith('/docs/tree')) return docsTreeAnswer(REPOSITORY, NOW);
  const path = url.searchParams.get('path') ?? '';
  if (path !== BROKEN) return docsFileAnswer(REPOSITORY, path);
  const { body } = docsFileAnswer(REPOSITORY, 'docs/README.md') as { readonly body: Record<string, unknown> };
  return { status: 200, body: { ...body, path, size: new TextEncoder().encode(BROKEN_TEXT).length, text: BROKEN_TEXT, lines: docsLines(BROKEN_TEXT) } };
}

beforeEach(() => {
  window = new Window({ url: 'http://127.0.0.1:4318/' });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (media: string) => ({ matches: false, media, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => true }),
  });
  Object.assign(globalThis, {
    window, document: window.document, navigator: window.navigator, localStorage: window.localStorage,
    HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node, Event: window.Event, SVGElement: window.SVGElement,
    DOMParser: window.DOMParser, CSSStyleSheet: window.CSSStyleSheet, MouseEvent: window.MouseEvent, KeyboardEvent: window.KeyboardEvent, IS_REACT_ACT_ENVIRONMENT: true,
  });
  globalThis.fetch = (async (input: string | URL | Request) => {
    const { status, body } = answer(new URL(String(input), 'http://127.0.0.1:4318'));
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  globalThis.fetch = realFetch;
  await window.happyDOM.close();
});

async function settle(): Promise<void> {
  await act(async () => { for (let turn = 0; turn < 10; turn++) await new Promise(resolve => setTimeout(resolve, 0)); });
}

/** Mermaid's own nodes: the render container `d<id>`, its SVG `<id>`, and any diagram SVG Mermaid labels. */
const mermaidNodes = () => Array.from(document.querySelectorAll('[id^="docs-mermaid"], [id^="ddocs-mermaid"], svg[aria-roledescription]'))
  .map(node => `${node.tagName.toLowerCase()}#${node.id}`);

test('a malformed Mermaid block shows its source and leaves no Mermaid node in the document, also after navigation', async () => {
  window.location.hash = `#docs/${BROKEN}`;
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(
    <OperatorApp initialLocale="en" initialSnapshot={stableSnapshot} fetchSnapshot={async () => stableSnapshot}
      initialDevActivity={activity} fetchDevActivity={async () => activity}
      initialRuntimeOverlay={unavailableRuntimeOverlay()} readRuntimeStatus={async () => unavailableRuntimeOverlay()}
      readNotifyStatus={() => new Promise(() => {})} />,
  ));
  // Mermaid loads and parses asynchronously; wait for the diagram's final state.
  for (let wait = 0; wait < 100 && !document.querySelector('[data-mermaid="failed"], [data-mermaid="drawn"]'); wait++) await settle();

  const prose = document.querySelector<HTMLElement>('[data-docs-body]')!;
  expect(prose.querySelector('[data-mermaid]')?.getAttribute('data-mermaid')).toBe('failed');
  expect(prose.querySelector('pre code')?.textContent).toBe('graph LR\n  a["open --> \n');
  expect(mermaidNodes()).toEqual([]);

  await act(async () => document.querySelector<HTMLButtonElement>('[data-docs-directory="docs/design/notes"] button')!.click());
  await act(async () => document.querySelector<HTMLAnchorElement>('[data-docs-file="docs/design/notes/changelog.md"]')!.click());
  await settle();
  expect(document.querySelector('[data-docs-file-header] h2')?.textContent).toBe('docs/design/notes/changelog.md');
  expect(mermaidNodes()).toEqual([]);
});
