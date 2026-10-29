import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';

import { decodeDevActivitySnapshot } from '../../src/core/dev-activity/decode';
import { unavailableRuntimeOverlay } from '../../src/core/operator/runtime-status';
import { OperatorApp, type OperatorAppProps } from '../../src/operator-web/App';
import { docsLink, MERMAID_CONFIG } from '../../src/operator-web/DocsMarkdown';
import { stableSnapshot } from '../../src/operator-web/fixture';
import { busyDevActivity } from '../../src/operator-web/fixtures/dev-activity';
import { DOCS_COMMIT, docsFileAnswer, docsPendingAnswer, docsTreeAnswer, type DocsWireAnswer } from '../../src/operator-web/fixtures/docs';
import { parseWorkspaceLocation, workspaceHash } from '../../src/operator-web/workspace-location';

// Mermaid needs a layout engine to draw; this stand-in records how the page
// configures it and returns an SVG that carries a script, as an injected
// diagram could if the sanitizer ever let one through.
const mermaidCalls: { readonly kind: 'initialize' | 'render'; readonly value: unknown }[] = [];
const HOSTILE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" style="max-width: 320px;"><script>window.__mermaidRan = true</script><text>tree</text></svg>';
mock.module('mermaid', () => ({
  default: {
    initialize: (config: unknown) => { mermaidCalls.push({ kind: 'initialize', value: config }); },
    render: async (id: string, source: string) => { mermaidCalls.push({ kind: 'render', value: { id, source } }); return { svg: HOSTILE_SVG }; },
  },
}));

const REPOSITORY = 'repo-harness';
const NOW = Date.now();
const activity = decodeDevActivitySnapshot(busyDevActivity(NOW));

let root: Root | null = null;
let window: Window;
let requests: string[] = [];
let answerFor: (url: URL) => DocsWireAnswer;
const realFetch = globalThis.fetch;

/** The docs routes as the server answers them, from the wire-format fixtures. */
function serveDocs(url: URL): DocsWireAnswer {
  if (url.pathname === `/api/v1/repositories/${REPOSITORY}/docs/tree`) return docsTreeAnswer(REPOSITORY, NOW);
  if (url.pathname === `/api/v1/repositories/${REPOSITORY}/docs/file`) return docsFileAnswer(REPOSITORY, url.searchParams.get('path') ?? '');
  return { status: 404, body: { error: { code: 'not_found', message: 'No route.', next_action: 'None.' } } };
}

beforeEach(() => {
  window = new Window({ url: 'http://127.0.0.1:4318/' });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (media: string) => ({ matches: false, media, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => true }),
  });
  Object.assign(globalThis, {
    window, document: window.document, navigator: window.navigator, localStorage: window.localStorage,
    HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node, Event: window.Event,
    MouseEvent: window.MouseEvent, KeyboardEvent: window.KeyboardEvent, IS_REACT_ACT_ENVIRONMENT: true,
  });
  requests = [];
  mermaidCalls.length = 0;
  answerFor = serveDocs;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input), 'http://127.0.0.1:4318');
    requests.push(url.pathname + url.search);
    const { status, body } = answerFor(url);
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

function props(): OperatorAppProps {
  return {
    initialLocale: 'en', initialSnapshot: stableSnapshot, fetchSnapshot: async () => stableSnapshot,
    initialDevActivity: activity, fetchDevActivity: async () => activity,
    initialRuntimeOverlay: unavailableRuntimeOverlay(), readRuntimeStatus: async () => unavailableRuntimeOverlay(),
    readNotifyStatus: () => new Promise(() => {}),
  };
}

async function mount(hash: string, appProps: OperatorAppProps = props()): Promise<void> {
  window.location.hash = hash;
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<OperatorApp {...appProps} />));
  await settle();
}

const page = () => document.querySelector<HTMLElement>('[data-docs-page]')!;
const body = () => document.querySelector<HTMLElement>('[data-docs-body]')!;
const fileRequest = (path: string) => `/api/v1/repositories/${REPOSITORY}/docs/file?${new URLSearchParams({ path })}`;

describe('docs route', () => {
  test('#docs/<path> names one repository-relative file; each segment is encoded on its own', () => {
    expect(parseWorkspaceLocation('#docs')).toEqual({ workspace: 'docs', module: null, item: null });
    expect(parseWorkspaceLocation('#docs/docs/design/a%20b.md')).toEqual({ workspace: 'docs', module: null, item: 'docs/design/a b.md' });
    expect(workspaceHash({ workspace: 'docs', module: null, item: 'docs/design/a b.md' })).toBe('#docs/docs/design/a%20b.md');
    // The route reads the path; the server decides whether it may be served.
    expect(parseWorkspaceLocation('#docs/docs/.env').item).toBe('docs/.env');
    expect(parseWorkspaceLocation('#docs/').workspace).toBe('home');
    expect(parseWorkspaceLocation('#docs/docs//a.md').workspace).toBe('home');
    expect(parseWorkspaceLocation('#docs/docs/%E0%A4%A').workspace).toBe('home');
  });

  test('a relative link opens only inside docs/, and a URL only for http or https', () => {
    const from = 'docs/design/console.md';
    expect(docsLink('./notes/changelog.md#top', from)).toEqual({ kind: 'doc', path: 'docs/design/notes/changelog.md' });
    expect(docsLink('../README.md', from)).toEqual({ kind: 'doc', path: 'docs/README.md' });
    expect(docsLink('https://example.com/a?b=1', from)).toEqual({ kind: 'external', href: 'https://example.com/a?b=1' });
    for (const target of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,<script>1</script>', 'vbscript:x', 'mailto:a@b.c',
      '//evil.example/x', '/api/v1/fleet/snapshot', '#heading', '../../src/cli/index.ts', '../../../etc/passwd', 'java\tscript:alert(1)', '%2e%2e/%2e%2e/x']) {
      expect(docsLink(target, from)).toEqual({ kind: 'none' });
    }
  });
});

describe('docs page', () => {
  test('1-DOCS-P1 shows the tree, the rendered file and its commit, and labels a file whose working copy differs', async () => {
    await mount('#docs/docs/design/console.md');
    expect(document.querySelector('main')?.getAttribute('data-workspace')).toBe('docs');
    expect(document.querySelector('.workspace-nav a[data-workspace="docs"]')?.getAttribute('aria-current')).toBe('page');
    // A single-repository page: the rail names the current repository and its head.
    expect(document.querySelector('[data-repository-switch]')?.getAttribute('data-repository-switch')).toBe('current');
    expect(document.querySelector('[data-switch-detail]')?.textContent).toContain(DOCS_COMMIT.slice(0, 7));
    expect(requests).toContain(`/api/v1/repositories/${REPOSITORY}/docs/tree`);
    expect(requests).toContain(fileRequest('docs/design/console.md'));

    // The tree folds by directory with file counts; the open file's directory starts open.
    expect(document.querySelector('[data-docs-tree]')?.getAttribute('data-docs-tree')).toBe('5');
    const design = document.querySelector<HTMLElement>('[data-docs-directory="docs/design"]')!;
    expect(design.querySelector('button')?.getAttribute('aria-expanded')).toBe('true');
    expect(design.querySelector('[data-docs-count]')?.textContent).toBe('2');
    expect(document.querySelector('[data-docs-directory="docs/reference"] button')?.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('[data-docs-file="docs/reference/settings.yaml"]')).toBeNull();
    expect(document.querySelector('[data-docs-file="docs/design/console.md"]')?.getAttribute('aria-current')).toBe('page');
    await act(async () => document.querySelector<HTMLButtonElement>('[data-docs-directory="docs/reference"] button')!.click());
    expect(document.querySelector('[data-docs-file="docs/reference/settings.yaml"]')).not.toBeNull();

    const header = document.querySelector<HTMLElement>('[data-docs-file-header]')!;
    expect(header.querySelector('h2')?.textContent).toBe('docs/design/console.md');
    expect(header.querySelector('[data-docs-commit]')?.textContent).toBe(`origin/main @ ${DOCS_COMMIT.slice(0, 7)}`);
    expect(header.querySelector('[data-docs-lines]')?.textContent).toBe('11 lines');
    expect(header.querySelector('[data-docs-dirty]')?.textContent).toBe('Working copy differs · citations use the commit');
    expect(body().querySelector('h1')?.textContent).toBe('Console design');
    expect(body().querySelector('h1')?.getAttribute('data-line')).toBe('1');
    expect(body().querySelector('h2')?.getAttribute('data-line')).toBe('3');

    // A clean file carries no label; a tree click moves the route.
    await act(async () => document.querySelector<HTMLAnchorElement>('[data-docs-file="docs/README.md"]')!.click());
    await settle();
    expect(window.location.hash).toBe('#docs/docs/README.md');
    expect(document.querySelector('[data-docs-file-header] h2')?.textContent).toBe('docs/README.md');
    expect(document.querySelector('[data-docs-dirty]')).toBeNull();

    // Phase 1 has no citation or session control: the only buttons are directory toggles.
    expect(page().querySelector('textarea, select, input:not([type="checkbox"])')).toBeNull();
    for (const button of page().querySelectorAll('button')) expect(button.closest('[data-docs-directory]')).not.toBeNull();
  });

  test('1-DOCS-N1 renders raw HTML as text, opens only safe links, and shows a strict Mermaid diagram as an image', async () => {
    await mount('#docs/docs/README.md');
    const prose = body();
    // Raw HTML is text: no element is created from it.
    expect(prose.querySelector('script')).toBeNull();
    expect(prose.querySelector('img[src="x"], img[onerror]')).toBeNull();
    expect(prose.textContent).toContain(`<script>alert('readme')</script>`);
    expect(prose.textContent).toContain(`<img src=x onerror="alert('img')">`);

    // Links: a javascript: URL and a path outside docs/ are text; docs links stay in the page; https opens outside.
    const blocked = Array.from(prose.querySelectorAll('[data-docs-link-blocked]')).map(node => node.textContent);
    expect(blocked).toEqual(['script link', 'source file']);
    for (const anchor of prose.querySelectorAll('a')) expect(anchor.getAttribute('href')).toMatch(/^(?:#docs\/docs\/|https:\/\/)/u);
    expect(prose.querySelector('[data-docs-link="docs/design/console.md"]')?.getAttribute('href')).toBe('#docs/docs/design/console.md');
    expect(prose.querySelector('[data-docs-link="docs/design/notes/changelog.md"]')?.getAttribute('href')).toBe('#docs/docs/design/notes/changelog.md');
    const external = prose.querySelector<HTMLAnchorElement>('a[href="https://kumo-ui.com/"]')!;
    expect(external.getAttribute('target')).toBe('_blank');
    expect(external.getAttribute('rel')).toBe('noreferrer noopener');

    // Mermaid: strict security, the injected source passed through untouched, and the SVG shown only as an image.
    expect(mermaidCalls.find(call => call.kind === 'initialize')?.value).toMatchObject({ securityLevel: 'strict', startOnLoad: false, htmlLabels: false });
    expect(MERMAID_CONFIG.securityLevel).toBe('strict');
    const rendered = mermaidCalls.find(call => call.kind === 'render')?.value as { readonly source: string };
    expect(rendered.source).toContain(`%%{init: {"securityLevel": "loose"}}%%`);
    expect(rendered.source).toContain(`click page call alert("click")`);
    const image = prose.querySelector<HTMLImageElement>('img[data-mermaid="drawn"]')!;
    expect(image.getAttribute('src')).toBe(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(HOSTILE_SVG)}`);
    expect(image.getAttribute('width')).toBe('320');
    // The diagram's markup never enters the DOM; the only inline SVGs are the icons.
    expect(document.querySelector('svg script, svg text')).toBeNull();
    for (const svg of prose.querySelectorAll('svg')) expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect((window as unknown as { __mermaidRan?: boolean }).__mermaidRan).toBeUndefined();
    // An ordinary code block stays a code block.
    expect(prose.querySelector('pre code.language-ts')?.textContent).toContain('/docs/tree');
  });

  test('1-DOCS-F1 shows the server reason for a refused path and none of its content', async () => {
    for (const [path, reason, text] of [
      ['docs/.env', 'path_denied', 'The path is outside docs/ or names a secret-bearing file.'],
      ['docs/.git/config', 'path_denied', 'The path is outside docs/ or names a secret-bearing file.'],
      ['docs/linked.md', 'path_escape', 'The path resolves outside docs/ through a symlink or submodule.'],
    ] as const) {
      if (root) { await act(async () => root?.unmount()); root = null; }
      await mount(workspaceHash({ workspace: 'docs', module: null, item: path }));
      expect(requests).toContain(fileRequest(path));
      const refusal = document.querySelector<HTMLElement>(`[data-docs-refusal="${reason}"]`)!;
      expect(refusal.textContent).toContain(text);
      expect(refusal.textContent).toContain(reason);
      expect(document.querySelector('[data-docs-body], [data-docs-source], [data-docs-file-header]')).toBeNull();
      // The tree still lists the readable files.
      expect(document.querySelector('[data-docs-tree]')).not.toBeNull();
    }
  });

  test('a refused tree shows its reason instead of a tree, and a non-markdown file shows numbered lines', async () => {
    answerFor = url => url.pathname.endsWith('/docs/tree') ? docsPendingAnswer : serveDocs(url);
    await mount('#docs/docs/reference/settings.yaml');
    expect(document.querySelector('[data-docs-refusal="docs_pending"]')?.textContent).toContain('The docs listing is not collected yet.');
    expect(document.querySelector('[data-docs-tree]')).toBeNull();
    expect(requests.some(request => request.includes('/docs/file'))).toBe(false);

    await act(async () => root?.unmount());
    root = null;
    answerFor = serveDocs;
    await mount('#docs/docs/reference/settings.yaml');
    const lines = Array.from(document.querySelectorAll('[data-docs-source] li'));
    expect(lines.map(line => line.getAttribute('data-line'))).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(lines[2]?.textContent).toBe('  host: 127.0.0.1');
    // Blank lines, one alone and two in a row, stay rows of their own.
    expect([4, 7, 8].map(index => lines[index]?.textContent)).toEqual(['', '', '']);
    expect(lines[9]?.textContent).toBe('notify: off');
  });
});
