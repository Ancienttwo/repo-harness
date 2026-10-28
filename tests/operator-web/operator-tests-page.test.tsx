import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';

import { decodeTestsSnapshot } from '../../src/core/operator/tests';
import { OperatorApp, type OperatorAppProps } from '../../src/operator-web/App';
import { decodeDevActivitySnapshot } from '../../src/core/dev-activity/decode';
import { unavailableRuntimeOverlay } from '../../src/core/operator/runtime-status';
import type { TestsRead, TestsReader } from '../../src/operator-web/repository-reads';
import { fixtureProps, FIXTURE_NAMES } from '../../src/operator-web/fixtures';
import { readyRepairIssue, readyTests } from '../../src/operator-web/fixtures/tests';
import { busyDevActivity } from '../../src/operator-web/fixtures/dev-activity';
import { stableSnapshot } from '../../src/operator-web/fixture';
import { parseWorkspaceLocation, workspaceHash } from '../../src/operator-web/workspace-location';

let root: Root | null = null;
let window: Window;

function installDom(url = 'http://127.0.0.1:4318/'): void {
  window = new Window({ url });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (media: string) => ({ matches: false, media, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => true }),
  });
  Object.assign(globalThis, {
    window, document: window.document, navigator: window.navigator, localStorage: window.localStorage,
    HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node, Event: window.Event,
    MouseEvent: window.MouseEvent, KeyboardEvent: window.KeyboardEvent, IS_REACT_ACT_ENVIRONMENT: true,
  });
}

const NOW = Date.now();
const activity = decodeDevActivitySnapshot(busyDevActivity(NOW));

function testsReader(read: TestsRead): TestsReader {
  return async () => read;
}

function props(read: TestsRead, overrides: Partial<OperatorAppProps> = {}): OperatorAppProps {
  return {
    initialLocale: 'en', initialSnapshot: stableSnapshot, fetchSnapshot: async () => stableSnapshot,
    initialDevActivity: activity, fetchDevActivity: async () => activity,
    initialRuntimeOverlay: unavailableRuntimeOverlay(), readRuntimeStatus: async () => unavailableRuntimeOverlay(),
    readNotifyStatus: () => new Promise(() => {}),
    readTests: testsReader(read),
    ...overrides,
  };
}

async function mount(hash: string, appProps: OperatorAppProps): Promise<void> {
  window.location.hash = hash;
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<OperatorApp {...appProps} />));
}

const page = () => document.querySelector<HTMLElement>('[data-tests-page]')!;
const all = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector));

beforeEach(() => installDom());
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  window.happyDOM.abort();
});

const okRead = (): TestsRead => ({ state: 'ok', snapshot: decodeTestsSnapshot(readyTests(NOW)) });

/** The JUnit artifact is missing; the projection still lists every file. */
function withoutResults(): TestsRead {
  const snapshot = readyTests(NOW);
  return { state: 'ok', snapshot: decodeTestsSnapshot({ ...snapshot, results: { state: 'unavailable', reason: 'junit_missing' } }) };
}

/** The projection artifact is missing; only files with JUnit entries show. */
function withoutProjection(): TestsRead {
  const snapshot = readyTests(NOW);
  return { state: 'ok', snapshot: decodeTestsSnapshot({ ...snapshot, projection: { state: 'unavailable', reason: 'projection_missing' } }) };
}
describe('tests fixtures', () => {
  test('the fixture snapshot passes the browser decoder and every named fixture carries a tests read', async () => {
    expect(() => decodeTestsSnapshot(readyTests(NOW))).not.toThrow();
    const noResults = withoutResults();
    expect(noResults.state).toBe('ok');
    if (noResults.state === 'ok') expect(() => decodeTestsSnapshot(noResults.snapshot)).not.toThrow();
    for (const name of FIXTURE_NAMES) expect(fixtureProps(name).readTests).toBeInstanceOf(Function);
    const signal = new AbortController().signal;
    const id = 'repo_a5b76eee64af71c3';
    expect((await fixtureProps('busy').readTests!(id, signal)).state).toBe('ok');
    expect(await fixtureProps('empty').readTests!(id, signal)).toEqual({ state: 'unavailable', reason: 'tests_pending' });
    expect(await fixtureProps('degraded').readTests!(id, signal)).toEqual({ state: 'unavailable', reason: 'artifacts_missing' });
  });
});

describe('tests page', () => {
  test('the page has its own hash without a parameter', () => {
    expect(parseWorkspaceLocation('#tests')).toEqual({ workspace: 'tests', module: null, item: null });
    expect(workspaceHash({ workspace: 'tests', module: null, item: null })).toBe('#tests');
    expect(parseWorkspaceLocation('#tests/extra').workspace).toBe('home');
  });

  test('first entry loads repository inventory before showing its test results', async () => {
    let fleetReads = 0;
    const requested: string[] = [];
    const fleet = fixtureProps('busy').initialSnapshot!;
    await mount('#tests', props(okRead(), {
      initialSnapshot: undefined,
      fetchSnapshot: async () => { fleetReads++; return fleet; },
      readTests: async id => { requested.push(id); return okRead(); },
    }));
    expect(fleetReads).toBe(1);
    expect(requested).toEqual(['repo_a5b76eee64af71c3']);
    expect(all('[data-test-file]')).toHaveLength(4);
  });

  test('a finished daily run lists its inventory grouped by directory, with per-file results, capabilities and commands', async () => {
    await mount('#tests', props(okRead()));
    expect(document.querySelector('[data-tests-page]')).not.toBeNull();
    expect(document.querySelector('[data-tests-run="4036605416"]')).not.toBeNull();
    expect(document.querySelector('[data-tests-channel="daily_full"]')).not.toBeNull();
    expect(all('[data-test-directory]').map(node => node.getAttribute('data-test-directory'))).toEqual(['tests', 'tests/cli', 'tests/operator']);
    const files = all('[data-test-file]');
    expect(files.map(node => node.getAttribute('data-test-file'))).toEqual([
      'tests/loose-root.test.ts', 'tests/cli/runner-z.test.ts', 'tests/operator/core-x.test.ts', 'tests/operator/server-y.test.ts',
    ]);
    const byFile = new Map(files.map(node => [node.getAttribute('data-test-file'), node]));
    expect(byFile.get('tests/operator/server-y.test.ts')?.getAttribute('data-test-result')).toBe('failed');
    expect(byFile.get('tests/operator/server-y.test.ts')?.textContent).toContain('keeps GET free of side effects');
    expect(byFile.get('tests/operator/core-x.test.ts')?.getAttribute('data-test-result')).toBe('passed');
    expect(byFile.get('tests/operator/core-x.test.ts')?.textContent).toContain('2 passed');
    expect(byFile.get('tests/cli/runner-z.test.ts')?.textContent).toContain('1 skipped');
    // No results ⇒ no pass: the file without a JUnit entry never renders a pass count.
    const loose = byFile.get('tests/loose-root.test.ts')!;
    expect(loose.getAttribute('data-test-result')).toBe('none');
    expect(loose.textContent).not.toContain('passed');
    expect(loose.textContent).toContain('No result in the latest daily run');
    // G21: the projection maps each file to its capabilities; every file carries its own copyable command.
    expect(all('[data-capability="runtime-harness.operator"]').length).toBeGreaterThan(0);
    expect(all('[data-command]')).toHaveLength(4);
    expect(document.querySelector('[data-test-file="tests/cli/runner-z.test.ts"] [data-command] code')!.textContent)
      .toBe('bun run test:files tests/cli/runner-z.test.ts --timeout 60000 --max-concurrency 1');
    const summary = document.querySelector('[data-tests-summary]')!.textContent ?? '';
    expect(summary).toContain('2 passed');
    expect(summary).toContain('1 failed');
    expect(summary).toContain('1 no result');
  });

  test('a route refusal shows its reason and claims no pass anywhere', async () => {
    await mount('#tests', props({ state: 'unavailable', reason: 'artifacts_missing' }));
    expect(document.querySelector('[data-tests-unavailable="artifacts_missing"]')!.textContent).toContain('The daily CI run uploaded no test artifacts');
    expect(document.querySelector('[data-test-file]')).toBeNull();
    expect(document.querySelector('[data-tests-summary]')).toBeNull();
    expect(page().textContent).not.toContain('passed');
  });

  test('a recorded skipped file is distinct from a file with no result', async () => {
    const base = readyTests(NOW);
    if (base.projection.state !== 'ok' || base.results.state !== 'ok') throw new Error('ready fixture must contain both artifacts');
    const projection = base.projection.files[0]!;
    const result = base.results.files.find(entry => entry.file === projection.file)!;
    const snapshot = decodeTestsSnapshot({
      ...base,
      projection: { state: 'ok', files: [projection] },
      results: { state: 'ok', files: [{ ...result, duration_ms: 0, cases: result.cases.filter(entry => entry.result === 'skipped') }] },
    });
    await mount('#tests', props({ state: 'ok', snapshot }));
    expect(document.querySelector('[data-test-file]')?.getAttribute('data-test-result')).toBe('skipped');
    const summary = document.querySelector('[data-tests-summary]')!.textContent ?? '';
    expect(summary).toContain('1 skipped');
    expect(summary).toContain('0 no result');
    expect(summary).toContain('0 passed');
  });

  test('a missing JUnit artifact keeps the inventory but shows every file as no result', async () => {
    await mount('#tests', props(withoutResults()));
    expect(document.querySelector('[data-tests-section-reason="junit_missing"]')).not.toBeNull();
    expect(all('[data-test-file]').map(node => node.getAttribute('data-test-result'))).toEqual(['none', 'none', 'none', 'none']);
    const summary = document.querySelector('[data-tests-summary]')!.textContent ?? '';
    expect(summary).toContain('4 no result');
    expect(summary).toContain('0 passed');
    for (const row of all('[data-test-file]')) expect(row.textContent).not.toContain('passed');
  });

  test('the open CI repair issues render on the page and are never silently dropped', async () => {
    await mount('#tests', props(okRead()));
    const repairs = document.querySelector('[data-tests-repairs]')!;
    expect(repairs).not.toBeNull();
    expect(repairs.getAttribute('data-tests-repairs')).toBe('1');
    const link = document.querySelector('[data-tests-repair="1101"] a');
    expect(link?.getAttribute('href')).toBe(readyRepairIssue.url);
    expect(link?.textContent).toContain('#1101');
    expect(link?.textContent).toContain('[CI repair] daily full run failed');
  });

  test('an unreadable repairs section warns with its reason instead of claiming there are none', async () => {
    const base = readyTests(NOW);
    await mount('#tests', props({ state: 'ok', snapshot: decodeTestsSnapshot({ ...base, repairs: { state: 'unavailable', reason: 'repairs_unavailable' } }) }));
    const reason = document.querySelector('[data-tests-repairs-reason="repairs_unavailable"]');
    expect(reason?.textContent).toContain('The CI repair issues could not be read');
    expect(document.querySelector('[data-tests-repairs]')).toBeNull();
    expect(document.querySelector('[data-tests-page]')!.textContent).not.toContain('No open CI repair issue');
  });

  test('an empty repair list says so explicitly', async () => {
    await mount('#tests', props({ state: 'ok', snapshot: decodeTestsSnapshot({ ...readyTests(NOW), repairs: { state: 'ok', issues: [] } }) }));
    expect(document.querySelector('[data-tests-repairs]')!.getAttribute('data-tests-repairs')).toBe('0');
    expect(document.querySelector('[data-tests-page]')!.textContent).toContain('No open CI repair issue');
  });

  test('a missing projection keeps the results and names the gap', async () => {
    await mount('#tests', props(withoutProjection()));
    expect(document.querySelector('[data-tests-section-reason="projection_missing"]')).not.toBeNull();
    expect(all('[data-test-file]').map(node => node.getAttribute('data-test-file')))
      .toEqual(['tests/cli/runner-z.test.ts', 'tests/operator/core-x.test.ts', 'tests/operator/server-y.test.ts']);
    expect(document.querySelector('[data-tests-summary]')!.textContent).toContain('1 failed');
  });
});
