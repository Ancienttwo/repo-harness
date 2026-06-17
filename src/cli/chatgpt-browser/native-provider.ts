import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { createServer } from 'net';
import { homedir } from 'os';
import { resolve } from 'path';
import type { BrowserConsultInput, NativeBrowserChannel, PromptBundle } from './types';

export interface NativeProviderResult {
  status: 'completed' | 'failed' | 'incomplete_capture';
  output: string;
  conversationUrl?: string;
  error?: {
    code: string;
    message: string;
    recovery?: string;
  };
}

const COMPOSER_SELECTORS = [
  '[data-testid="composer-text-input"]',
  '#prompt-textarea',
  'textarea[placeholder*="Message"]',
  'div[role="textbox"][contenteditable="true"]',
];

const SEND_BUTTON_SELECTORS = [
  '[data-testid="send-button"]',
  'button[aria-label*="Send"]',
  'button[data-testid*="send"]',
];

const ASSISTANT_SELECTOR = '[data-message-author-role="assistant"]';

const CHANNEL_APPS: Record<NativeBrowserChannel, { appName: string; executable: string }> = {
  chrome: {
    appName: 'Google Chrome',
    executable: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  },
  'chrome-beta': {
    appName: 'Google Chrome Beta',
    executable: '/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta',
  },
  'chrome-dev': {
    appName: 'Google Chrome Dev',
    executable: '/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev',
  },
  'chrome-canary': {
    appName: 'Google Chrome Canary',
    executable: '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  },
};

interface CdpConnection {
  send(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<any>;
  close(): void;
}

function defaultProfileDir(): string {
  return resolve(homedir(), '.repo-harness/chatgpt-browser-profile');
}

function browserChannel(input?: NativeBrowserChannel): NativeBrowserChannel {
  return input ?? 'chrome';
}

function chromeExecutable(channel: NativeBrowserChannel): string {
  return CHANNEL_APPS[channel].executable;
}

export async function nativeProviderAvailable(): Promise<boolean> {
  return process.platform === 'darwin' && existsSync(chromeExecutable('chrome'));
}

function conversationUrl(url: string): string | undefined {
  return /^https:\/\/chatgpt\.com\/c\//.test(url) ? url : undefined;
}

function normalizeAssistantText(raw: string | null | undefined): string {
  const text = (raw ?? '')
    .replace(/^ChatGPT said:\s*/i, '')
    .replace(/^Assistant\s*/i, '')
    .trim();
  if (text === 'Retry') return '';
  return text;
}

async function getFreePort(): Promise<number> {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === 'object' && address) resolvePort(address.port);
        else reject(new Error('failed to allocate local CDP port'));
      });
    });
    server.on('error', reject);
  });
}

async function waitForCdp(port: number, timeoutMs: number): Promise<{ webSocketDebuggerUrl: string; Browser?: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        const body = await response.json() as { webSocketDebuggerUrl?: string; Browser?: string };
        if (body.webSocketDebuggerUrl) return { webSocketDebuggerUrl: body.webSocketDebuggerUrl, Browser: body.Browser };
      }
    } catch (_error) {
      // Chrome may need a moment to expose the DevTools endpoint.
    }
    await Bun.sleep(250);
  }
  throw new Error(`Chrome CDP endpoint did not become ready on port ${port}`);
}

function connectCdp(webSocketUrl: string): Promise<CdpConnection> {
  return new Promise((resolveConnection, reject) => {
    const ws = new WebSocket(webSocketUrl);
    let nextId = 1;
    const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: Timer }>();

    ws.onopen = () => {
      resolveConnection({
        send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<any> {
          const id = nextId++;
          const payload = { id, method, params, ...(sessionId ? { sessionId } : {}) };
          ws.send(JSON.stringify(payload));
          return new Promise((resolve, rejectSend) => {
            const timer = setTimeout(() => {
              pending.delete(id);
              rejectSend(new Error(`${method} timed out`));
            }, 30_000);
            pending.set(id, { resolve, reject: rejectSend, timer });
          });
        },
        close(): void {
          ws.close();
        },
      });
    };
    ws.onerror = () => reject(new Error(`failed to connect to Chrome CDP websocket: ${webSocketUrl}`));
    ws.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: { message?: string } };
      if (!message.id || !pending.has(message.id)) return;
      const waiting = pending.get(message.id);
      if (!waiting) return;
      clearTimeout(waiting.timer);
      pending.delete(message.id);
      if (message.error) waiting.reject(new Error(message.error.message ?? JSON.stringify(message.error)));
      else waiting.resolve(message.result);
    };
  });
}

async function launchChrome(channel: NativeBrowserChannel, profileDir: string, port: number, headless: boolean): Promise<void> {
  const app = CHANNEL_APPS[channel];
  if (!existsSync(app.executable)) throw new Error(`${app.appName} is not installed at ${app.executable}`);
  const args = [
    '-na',
    app.appName,
    '--args',
    `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    ...(headless ? ['--headless=new'] : []),
    'about:blank',
  ];
  const result = spawnSync('open', args, { encoding: 'utf-8' });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `failed to open ${app.appName}`).trim());
  }
}

function killProfileChrome(profileDir: string): void {
  const escaped = profileDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const listing = spawnSync('ps', ['-ax', '-o', 'pid=,command='], { encoding: 'utf-8' }).stdout ?? '';
  for (const line of listing.split(/\r?\n/)) {
    if (!new RegExp(escaped).test(line)) continue;
    if (!line.includes('/Applications/Google Chrome')) continue;
    const pid = Number(line.trim().split(/\s+/, 1)[0]);
    if (Number.isInteger(pid) && pid > 0) {
      try {
        process.kill(pid);
      } catch (_error) {
        // Browser cleanup is best-effort; the session store records the run result.
      }
    }
  }
}

function browserEval(body: string): string {
  return `(() => { try { ${body} } catch (error) { return { ok: false, error: String(error), url: location.href, title: document.title }; } })()`;
}

async function evaluate(connection: CdpConnection, sessionId: string, body: string): Promise<any> {
  const result = await connection.send('Runtime.evaluate', {
    expression: browserEval(body),
    returnByValue: true,
    awaitPromise: true,
  }, sessionId);
  return result?.result?.value;
}

async function waitFor<T>(deadlineMs: number, fn: () => Promise<T>, accept: (value: T) => boolean): Promise<T | null> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const value = await fn();
    if (accept(value)) return value;
    await Bun.sleep(500);
  }
  return null;
}

async function currentUrl(connection: CdpConnection, sessionId: string): Promise<string> {
  const result = await evaluate(connection, sessionId, 'return location.href;');
  return typeof result === 'string' ? result : '';
}

async function findComposer(connection: CdpConnection, sessionId: string, timeoutMs: number): Promise<any | null> {
  const selectors = JSON.stringify(COMPOSER_SELECTORS);
  return waitFor(timeoutMs, () => evaluate(connection, sessionId, `
    const selectors = ${selectors};
    const element = selectors.map((selector) => document.querySelector(selector)).find((candidate) => candidate && candidate.getClientRects().length);
    return { ok: Boolean(element), url: location.href, title: document.title };
  `), (value) => value?.ok === true);
}

async function submitPrompt(connection: CdpConnection, sessionId: string, renderedPrompt: string): Promise<void> {
  const selectors = JSON.stringify(COMPOSER_SELECTORS);
  const focused = await evaluate(connection, sessionId, `
    const selectors = ${selectors};
    const element = selectors.map((selector) => document.querySelector(selector)).find((candidate) => candidate && candidate.getClientRects().length);
    if (!element) return { ok: false };
    element.focus();
    if ('value' in element) {
      element.value = '';
      element.dispatchEvent(new InputEvent('input', { inputType: 'deleteContentBackward', bubbles: true }));
    } else {
      element.textContent = '';
      element.dispatchEvent(new InputEvent('input', { inputType: 'deleteContentBackward', bubbles: true }));
    }
    return { ok: true };
  `);
  if (focused?.ok !== true) throw new Error('ChatGPT composer disappeared before prompt submission');
  await connection.send('Input.insertText', { text: renderedPrompt }, sessionId);
  const buttonSelectors = JSON.stringify(SEND_BUTTON_SELECTORS);
  const clicked = await waitFor(5000, () => evaluate(connection, sessionId, `
    const selectors = ${buttonSelectors};
    const button = selectors.map((selector) => document.querySelector(selector)).find((candidate) => candidate && candidate.getClientRects().length && !candidate.disabled);
    if (!button) return { ok: false };
    button.click();
    return { ok: true };
  `), (value) => value?.ok === true);
  if (clicked?.ok === true) return;
  await connection.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, sessionId);
  await connection.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, sessionId);
}

async function waitForAssistantText(connection: CdpConnection, sessionId: string, timeoutMs: number): Promise<string> {
  const result = await waitFor(timeoutMs, () => evaluate(connection, sessionId, `
    const nodes = [...document.querySelectorAll(${JSON.stringify(ASSISTANT_SELECTOR)})];
    const raw = nodes.at(-1)?.innerText || '';
    return { text: raw, url: location.href };
  `), (value) => Boolean(normalizeAssistantText(value?.text)));
  return normalizeAssistantText(result?.text);
}

export async function runNativeProvider(input: BrowserConsultInput, bundle: PromptBundle): Promise<NativeProviderResult> {
  const channel = browserChannel(input.browserChannel);
  const profileDir = input.profileDir ? resolve(input.profileDir) : defaultProfileDir();
  const timeoutMs = input.timeoutMs ?? 180_000;
  let connection: CdpConnection | undefined;
  let sessionId: string | undefined;
  try {
    const port = await getFreePort();
    await launchChrome(channel, profileDir, port, input.headless === true);
    const version = await waitForCdp(port, Math.min(timeoutMs, 30_000));
    connection = await connectCdp(version.webSocketDebuggerUrl);
    const target = await connection.send('Target.createTarget', { url: 'about:blank' });
    const attached = await connection.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    sessionId = attached.sessionId;
    await connection.send('Page.enable', {}, sessionId);
    await connection.send('Runtime.enable', {}, sessionId);
    await connection.send('Page.navigate', { url: input.chatgptUrl ?? 'https://chatgpt.com/' }, sessionId);
    const composer = await findComposer(connection, sessionId, Math.min(timeoutMs, 180_000));
    if (!composer) {
      const url = await currentUrl(connection, sessionId);
      return {
        status: 'failed',
        output: [
          'ChatGPT login or composer is not ready.',
          `Opened: ${url}`,
          `Profile: ${profileDir}`,
          `Browser channel: ${channel}`,
          'Complete login manually, then rerun with the same profile.',
        ].join('\n'),
        conversationUrl: conversationUrl(url),
        error: {
          code: 'LOGIN_OR_COMPOSER_NOT_READY',
          message: 'ChatGPT login or composer is not ready',
          recovery: 'Run again with --keep-browser, finish login in the opened Chrome window, then retry.',
        },
      };
    }

    await submitPrompt(connection, sessionId, bundle.rendered);
    const output = await waitForAssistantText(connection, sessionId, timeoutMs);
    const url = await currentUrl(connection, sessionId);
    if (!output) {
      return {
        status: 'incomplete_capture',
        output: [
          'Native provider submitted or opened the ChatGPT page, but no assistant text could be captured before timeout.',
          `Current URL: ${url}`,
          `Browser channel: ${channel}`,
        ].join('\n'),
        conversationUrl: conversationUrl(url),
        error: {
          code: 'ASSISTANT_CAPTURE_TIMEOUT',
          message: 'no assistant text could be captured before timeout',
          recovery: 'Inspect the kept browser session or rerun with a longer --timeout-ms.',
        },
      };
    }
    return {
      status: 'completed',
      output,
      conversationUrl: conversationUrl(url),
    };
  } catch (error) {
    return {
      status: 'failed',
      output: error instanceof Error ? error.message : String(error),
      error: {
        code: 'NATIVE_PROVIDER_FAILED',
        message: error instanceof Error ? error.message : String(error),
        recovery: `Verify Google Chrome is installed for channel "${channel}", then rerun with a fresh --profile-dir.`,
      },
    };
  } finally {
    if (input.keepBrowser !== true) {
      if (connection) {
        await connection.send('Browser.close').catch(() => undefined);
        connection.close();
      }
      killProfileChrome(profileDir);
    }
  }
}
