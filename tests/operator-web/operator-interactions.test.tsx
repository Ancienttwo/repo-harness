import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { extname, relative, resolve } from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import { useObservationRefresh } from '../../src/operator-web/useObservationRefresh';

import { OperatorApp } from '../../src/operator-web/App';
import { LOGO_MARK, MASCOTS } from '../../src/operator-web/brand';
import { registryOf } from '../../src/operator-web/fixtures';
import {
  localeFromNavigatorLanguage,
  OPERATOR_LOCALE_STORAGE_KEY,
  readStoredLocale,
  relativeAge,
  resolveInitialLocale,
  translate,
  writeStoredLocale,
} from '../../src/operator-web/i18n';

const REGISTRY = registryOf(['repo-harness', 'repo-console']);

let root: Root | null = null;
let window: Window;

/**
 * `matchMedia` is stubbed rather than driven by a viewport size so the modal and
 * the persistent-pane layouts are both asserted deterministically.
 */
function installDom(wide = false): void {
  window = new Window({ url: 'http://127.0.0.1:4318/' });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (media: string) => ({
      matches: wide,
      media,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => true,
    }),
  });
  const lockQueues = new Map<string, Promise<unknown>>();
  Object.defineProperty(window.navigator, 'locks', {
    configurable: true,
    value: {
      request: (name: string, callback: () => unknown) => {
        const result = (lockQueues.get(name) ?? Promise.resolve()).then(callback);
        lockQueues.set(name, result.catch(() => undefined));
        return result;
      },
    },
  });
  Object.assign(globalThis, {
    window,
    document: window.document,
    navigator: window.navigator,
    localStorage: window.localStorage,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
    KeyboardEvent: window.KeyboardEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
}

function buttonWithText(text: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(text),
  );
  if (!(button instanceof window.HTMLButtonElement)) throw new Error(`button not found: ${text}`);
  return button as unknown as HTMLButtonElement;
}

async function mount(node: React.ReactElement): Promise<void> {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(node));
}

beforeEach(() => {
  installDom();
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  window.close();
});

const notifyStatus: import('../../src/core/operator/notify-status').NotifyStatusV1 = {
  protocol: 2,
  kind: 'operator_notify_status',
  relay: 'live',
  config: { WEBHOOK_URL: 'configured', WEBHOOK_KEY: 'missing', SLACK_WEBHOOK_URL: 'missing' },
  last_delivery: { at: null, result: 'missing' },
  observed_at: '2026-09-22T00:00:00.000Z',
};
function observationClock() {
  const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  const timers = new Map<number,{at:number;run:()=>void}>();
  let now=0,id=-1;
  globalThis.setTimeout = ((run:()=>void,delay=0) => {
    if(delay<30_000)return originalSet(run,delay);
    const handle=id--;timers.set(handle,{at:now+delay,run});return handle;
  }) as unknown as typeof setTimeout;
  globalThis.clearTimeout = ((handle:ReturnType<typeof setTimeout>) => {
    if(!timers.delete(handle as unknown as number))originalClear(handle);
  }) as typeof clearTimeout;
  return {
    delays:()=>[...timers.values()].map(timer=>timer.at-now).sort((a,b)=>a-b),
    advance:async(ms:number)=>{
      const target=now+ms;
      while(true){
        const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];
        if(!next||next[1].at>target)break;
        now=next[1].at;timers.delete(next[0]);await act(async()=>next[1].run());
      }
      now=target;
    },
    restore:()=>{globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;timers.clear();},
  };
}

function RefreshProbe({read,identity='source'}:{read:(signal:AbortSignal)=>Promise<boolean>;identity?:string}) {
  const refresh=useObservationRefresh(read,identity);
  return <button onClick={refresh}>Request observation</button>;
}

describe('bounded observation lifecycle',()=>{
  test('System-page readers pause while hidden and read once on return, including a deferred Refresh', async () => {
    const clock = observationClock();
    const counts = { notify: 0 };
    const page = (name: string) => act(async () => document.querySelector<HTMLAnchorElement>(`.workspace-nav a[data-workspace="${name}"]`)!.click());
    try {
      await mount(<OperatorApp initialRepositories={REGISTRY} readRepositories={async () => REGISTRY} initialLocale="en"
        readNotifyStatus={async () => { counts.notify++; return notifyStatus; }} />);
      // Notify belongs to the System page; no other page reads it.
      expect(counts).toEqual({ notify: 0 });
      await page('system');
      expect(counts).toMatchObject({ notify: 1 });
      await page('board');
      await clock.advance(600_000);
      expect(counts).toMatchObject({ notify: 1 });
      await act(async () => buttonWithText('Refresh').click());
      expect(counts).toMatchObject({ notify: 1 });
      await page('system');
      expect(counts).toMatchObject({ notify: 2 });
      // The System page keeps polling: one 30s tick adds exactly one read to each reader.
      const before = { notify: counts.notify };
      await clock.advance(30_000);
      expect(counts.notify).toBe(before.notify + 1);
    } finally {
      await act(async () => root?.unmount()); root = null; clock.restore();
    }
  });

  test('seeded System readers that start without a read still read at once on return', async () => {
    const clock = observationClock();
    const counts = { notify: 0 };
    const page = (name: string) => act(async () => document.querySelector<HTMLAnchorElement>(`.workspace-nav a[data-workspace="${name}"]`)!.click());
    window.location.hash = '#system';
    try {
      await mount(<OperatorApp initialRepositories={REGISTRY} readRepositories={async () => REGISTRY} initialLocale="en"
        initialNotifyStatus={notifyStatus} readNotifyStatus={async () => { counts.notify++; return notifyStatus; }} />);
      expect(counts).toEqual({ notify: 0 });
      await page('board');
      await clock.advance(300_000);
      expect(counts).toEqual({ notify: 0 });
      await page('system');
      expect(counts).toEqual({ notify: 1 });
    } finally {
      await act(async () => root?.unmount()); root = null; clock.restore();
    }
  });

  test('waits30s after completion, coalesces manual work and caps failure backoff at120s',async()=>{
    const clock=observationClock(),pending:Array<{signal:AbortSignal;finish:(success:boolean)=>void}>=[];
    const read=(signal:AbortSignal)=>new Promise<boolean>(finish=>pending.push({signal,finish}));
    try{
      await mount(<RefreshProbe read={read}/>);expect(pending).toHaveLength(1);expect(clock.delays()).toEqual([]);
      await clock.advance(90_000);expect(pending).toHaveLength(1);
      await act(async()=>pending[0]!.finish(true));expect(clock.delays()).toEqual([30_000]);
      await clock.advance(29_999);expect(pending).toHaveLength(1);
      await clock.advance(1);expect(pending).toHaveLength(2);expect(pending[0]!.signal.aborted).toBe(true);
      await act(async()=>{buttonWithText('Request observation').click();buttonWithText('Request observation').click();});
      expect(pending).toHaveLength(2);await act(async()=>pending[1]!.finish(false));expect(pending).toHaveLength(3);
      await act(async()=>pending[2]!.finish(false));expect(clock.delays()).toEqual([120_000]);
      await clock.advance(120_000);await act(async()=>pending[3]!.finish(false));expect(clock.delays()).toEqual([120_000]);
      await clock.advance(120_000);await act(async()=>pending[4]!.finish(true));expect(clock.delays()).toEqual([30_000]);
      await clock.advance(30_000);await act(async()=>pending[5]!.finish(false));expect(clock.delays()).toEqual([60_000]);
      await act(async()=>root?.unmount());root=null;expect(pending[5]!.signal.aborted).toBe(true);expect(clock.delays()).toEqual([]);
    }finally{clock.restore();}
  });

  test('starts nothing while hidden, aborts on hide and queues visible refresh until the old promise retires',async()=>{
    const clock=observationClock(),pending:Array<{signal:AbortSignal;finish:(success:boolean)=>void}>=[];let visibility='hidden';
    Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>visibility});
    const read=(signal:AbortSignal)=>new Promise<boolean>(finish=>pending.push({signal,finish}));
    const visible=async(value:string)=>{visibility=value;await act(async()=>document.dispatchEvent(new Event('visibilitychange')));};
    try{
      await mount(<RefreshProbe read={read}/>);await clock.advance(120_000);expect(pending).toHaveLength(0);
      await visible('visible');expect(pending).toHaveLength(1);
      await visible('hidden');expect(pending[0]!.signal.aborted).toBe(true);await clock.advance(120_000);expect(pending).toHaveLength(1);
      await visible('visible');expect(pending).toHaveLength(1);
      await act(async()=>pending[0]!.finish(true));expect(pending).toHaveLength(2);
      await act(async()=>pending[1]!.finish(true));expect(clock.delays()).toEqual([30_000]);
      await visible('hidden');expect(clock.delays()).toEqual([]);await visible('visible');expect(pending).toHaveLength(3);
      await act(async()=>root?.unmount());root=null;await act(async()=>pending[2]!.finish(true));expect(clock.delays()).toEqual([]);
    }finally{clock.restore();}
  });

  test('scope replacement invalidates the old promise and late completion cannot schedule it again',async()=>{
    const clock=observationClock(),pending:Array<{signal:AbortSignal;finish:(success:boolean)=>void}>=[];
    const read=(signal:AbortSignal)=>new Promise<boolean>(finish=>pending.push({signal,finish}));
    try{
      await mount(<RefreshProbe read={read} identity="repo-a"/>);
      await act(async()=>root?.render(<RefreshProbe read={read} identity="repo-b"/>));
      expect(pending[0]!.signal.aborted).toBe(true);expect(pending).toHaveLength(2);
      await act(async()=>pending[0]!.finish(true));expect(clock.delays()).toEqual([]);
      await act(async()=>pending[1]!.finish(true));expect(clock.delays()).toEqual([30_000]);
      await act(async()=>root?.unmount());root=null;expect(clock.delays()).toEqual([]);
    }finally{clock.restore();}
  });
});

describe('operator web interactions', () => {
  let server: ViteDevServer | undefined;
  afterAll(async () => { await server?.close(); });

  test('the page Refresh action also re-requests the Notify panel', async () => {
    let notify = 0;
    window.location.hash = '#system';
    await mount(<OperatorApp initialRepositories={REGISTRY} readRepositories={async () => REGISTRY} initialLocale="en"
      readNotifyStatus={async () => { notify += 1; if (notify === 1) throw new Error('notify down'); return notifyStatus; }} />);
    expect(notify).toBe(1);
    expect(document.querySelector('.notify-status')?.getAttribute('data-notify-state')).toBe('unavailable');
    await act(async () => buttonWithText('Refresh').click());
    expect(notify).toBe(2);
    expect(document.querySelector('.notify-status')?.getAttribute('data-notify-state')).toBe('ready');
  });

  test('defaults to English, switches to Chinese, and remembers the choice', async () => {
    document.documentElement.lang = 'en';
    window.location.hash = '#repositories';
    await mount(<OperatorApp initialRepositories={REGISTRY} readRepositories={async () => REGISTRY} />);

    expect(document.documentElement.lang).toBe('en');
    expect(document.querySelector('.operator-app')?.getAttribute('data-locale')).toBe('en');
    expect(document.querySelector('#repositories-heading')?.textContent).toContain('Repositories');

    await act(async () => buttonWithText('中').click());
    const text = document.body.textContent ?? '';
    expect(document.querySelector('.operator-app')?.getAttribute('data-locale')).toBe('zh');
    expect(document.documentElement.lang).toBe('zh');
    expect(document.querySelector('#repositories-heading')?.textContent).toContain('仓库');
    expect(window.localStorage.getItem(OPERATOR_LOCALE_STORAGE_KEY)).toBe('zh');

    // Repository names and the read-only contract are never translated.
    expect(text).toContain('repo-harness');
    expect(text).toContain('read-only except Agents');

    await act(async () => buttonWithText('EN').click());
    expect(document.documentElement.lang).toBe('en');
    expect(document.querySelector('.operator-app')?.getAttribute('data-locale')).toBe('en');
  });

  test('locale resolution prefers the stored choice and fails closed to English', () => {
    expect(localeFromNavigatorLanguage('zh-CN')).toBe('zh');
    expect(localeFromNavigatorLanguage('ZH')).toBe('zh');
    expect(localeFromNavigatorLanguage('fr-FR')).toBeNull();
    expect(localeFromNavigatorLanguage(null)).toBeNull();
    expect(resolveInitialLocale({ stored: null, language: 'zh-Hant' })).toBe('zh');
    expect(resolveInitialLocale({ stored: 'en', language: 'zh-CN' })).toBe('en');
    expect(resolveInitialLocale({ stored: null, language: 'fr-FR' })).toBe('en');
    expect(resolveInitialLocale({ stored: null, language: null })).toBe('en');

    const throwing = {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('blocked'); },
    } as unknown as Storage;
    expect(readStoredLocale(throwing)).toBeNull();
    expect(() => writeStoredLocale('zh', throwing)).not.toThrow();
    expect(readStoredLocale({ getItem: () => 'kl' } as unknown as Storage)).toBeNull();
  });

  test('reports data age in both locales from observed_at alone', () => {
    const observed = '2026-08-24T01:10:00.000Z';
    const base = Date.parse(observed);
    expect(relativeAge(observed, base + 30_000)).toEqual({ key: 'age.seconds', count: 30 });
    expect(relativeAge(observed, base + 120_000)).toEqual({ key: 'age.minutes', count: 2 });
    expect(relativeAge(observed, base + 7_200_000)).toEqual({ key: 'age.hours', count: 2 });
    expect(relativeAge(observed, base + 172_800_000)).toEqual({ key: 'age.days', count: 2 });
    expect(relativeAge('not-a-date', base)).toBeNull();
    expect(translate('en', 'status.observedAgo', { age: '2m' })).toBe('observed 2m ago');
    expect(translate('zh', 'status.observedAgo', { age: '2 分钟' })).toBe('2 分钟前读到的快照');
  });

  test('builds the console into the packaged static root with Tailwind and a loopback dev proxy', async () => {
    const config = (await import('../../vite.operator.config.ts')).default as {
      root: string; publicDir: string; build: { outDir: string }; server: { host: string; proxy: Record<string, string> }; plugins: unknown[];
    };
    const names = config.plugins.flat(Infinity).map(plugin => (plugin as { name?: string } | null)?.name ?? '');
    expect(config.root.endsWith('/src/operator-web')).toBe(true);
    // The console package owns the static build.
    expect(config.build.outDir.endsWith('/packages/operator-web/dist')).toBe(true);
    expect(names).toContain('@tailwindcss/vite:generate:build');
    expect(names).toContain('vite:react-babel');
    // Paper and Ink come from tokens.json; the logo and characters ship from the design system's assets under their own names.
    expect(names).toContain('repo-harness:design-tokens');
    expect(config.publicDir.endsWith('/docs/design/operator-console/design-system/assets')).toBe(true);
    const favicon = (await Bun.file('src/operator-web/index.html').text()).match(/rel="icon"[^>]*href="([^"]+)"/u)?.[1];
    for (const file of [favicon, LOGO_MARK, ...Object.values(MASCOTS)]) {
      expect(await Bun.file(`${config.publicDir}${file}`).exists()).toBe(true);
    }
    expect(config.server.host).toBe('127.0.0.1');
    expect(config.server.proxy['/api']).toBe(process.env.OPERATOR_API_ORIGIN ?? 'http://127.0.0.1:4318');
  });

  test('the browser import graph from main.tsx reaches no Node built-in', async () => {
    // Vite is the browser resolver: a built-in resolves to `__vite-browser-external`, and an unresolved import is null.
    server = await createServer({
      configFile: resolve('vite.operator.config.ts'),
      server: { middlewareMode: true, hmr: false, ws: false },
      optimizeDeps: { noDiscovery: true, entries: [] },
      logLevel: 'silent',
    });
    const loaders: Record<string, 'ts' | 'tsx' | 'js' | 'jsx'> = {
      '.ts': 'ts', '.mts': 'ts', '.cts': 'ts', '.tsx': 'tsx', '.js': 'js', '.mjs': 'js', '.cjs': 'js', '.jsx': 'jsx',
    };
    const entry = resolve('src/operator-web/main.tsx');
    const chains = new Map<string, string[]>([[entry, ['src/operator-web/main.tsx']]]);
    const queue = [entry];
    const offenders: string[] = [];
    for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
      const chain = chains.get(file)!;
      const loader = loaders[extname(file)]!;
      for (const { path: specifier } of new Bun.Transpiler({ loader }).scanImports(await Bun.file(file).text())) {
        const resolved = (await server.pluginContainer.resolveId(specifier, file))?.id;
        const via = `${chain.join(' -> ')} -> ${specifier}`;
        if (resolved === undefined || resolved.startsWith('__vite-browser-external')) {
          offenders.push(`${file} imports ${specifier}, which ${resolved === undefined ? 'does not resolve' : 'is a Node built-in'}, via ${via}`);
          continue;
        }
        const target = resolved.split('?')[0];
        // Dependencies, assets and virtual ids are leaves.
        if (target.startsWith('\0') || target.includes('/node_modules/') || loaders[extname(target)] === undefined || chains.has(target)) continue;
        chains.set(target, [...chain, relative(process.cwd(), target)]);
        queue.push(target);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('holds the Kumo import order, motion and type-size floor in one stylesheet', async () => {
    const css = await Bun.file('src/operator-web/app.css').text();

    // Kumo's tokens register before Tailwind, and Tailwind must scan Kumo's components.
    const order = ['@source "../../node_modules/@cloudflare/kumo/dist/', '@import "@cloudflare/kumo/styles/tailwind";', '@import "tailwindcss";']
      .map(fragment => css.indexOf(fragment));
    expect(order.every(index => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((left, right) => left - right));
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');

    const sizes = Array.from(css.matchAll(/font-size:\s*(\d+)px/gu), (match) => Number(match[1]));
    for await (const relative of new Bun.Glob('*.tsx').scan({ cwd: 'src/operator-web' })) {
      const source = await Bun.file(`src/operator-web/${relative}`).text();
      sizes.push(...Array.from(source.matchAll(/text-\[(\d+)px\]/gu), (match) => Number(match[1])));
    }
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(11);
  });

  /**
   * Brand orange belongs to identity art, so enforce that against the sources:
   * `marks.tsx` is brand identity art and may carry the brand orange; any other
   * component painting with it would be reusing the write accent as decoration.
   */
  test('keeps brand orange literals inside the design-system brand art', async () => {
    const BRAND_ORANGE = /#(?:E8742C|F2954A|C2571A|C2592C|A44721)\b/giu;
    const offenders: string[] = [];
    for await (const relative of new Bun.Glob('*.{ts,tsx,css,html}').scan({ cwd: 'src/operator-web' })) {
      const source = await Bun.file(`src/operator-web/${relative}`).text();
      const hits = source.match(BRAND_ORANGE);
      if (hits) offenders.push(`${relative}: ${hits.join(', ')}`);
    }
    expect(offenders).toEqual([]);

    // The console draws its logo from the design system's asset, which still carries the brand orange.
    expect(LOGO_MARK).toBe('/logos/repo-harness-carrot-mark-transparent.svg');
    expect((await Bun.file(`docs/design/operator-console/design-system/assets${LOGO_MARK}`).text()).match(BRAND_ORANGE)?.length ?? 0).toBeGreaterThan(0);
  });
});
