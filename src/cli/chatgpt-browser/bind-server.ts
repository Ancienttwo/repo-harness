import { join, resolve } from 'path';
import { existsSync, readFileSync } from 'fs';
import { CHATGPT_BRIDGE_DEFAULT_PORT, writeChatgptBridgeExtension } from './bridge-extension';
import {
  ensureBridgeToken,
  readBrowserBinding,
  updateBrowserBindingStatus,
} from './binding';
import {
  checkNativeChatgptSession,
  nativeDebuggingBlockedByDefaultProfile,
  nativeProviderAvailable,
  openNativeBrowserPage,
} from './native-provider';
import type { NativeBrowserChannel } from './types';

export interface BrowserBindServerOptions {
  profileDir?: string;
  profileDirectory?: string;
  browserChannel?: NativeBrowserChannel;
  chatgptUrl?: string;
  host?: string;
  port?: number;
  timeoutMs?: number;
  open?: boolean;
}

export interface BrowserBindServer {
  url: string;
  profileDir: string;
  profileDirectory?: string;
  browserChannel: NativeBrowserChannel;
  extensionDir: string;
  stop(): void;
}

export interface BridgeExtensionInstallStatus {
  status: 'installed' | 'disabled' | 'not_installed' | 'unknown';
  preferencesPath?: string;
  extensionId?: string;
  extensionName?: string;
  extensionPath?: string;
  error?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeComparablePath(path: string): string {
  const normalized = resolve(path);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function profileStateFileCandidates(profileDir: string, profileDirectory?: string): string[] {
  const profileRoots = profileDirectory
    ? [join(profileDir, profileDirectory)]
    : [
      join(profileDir, 'Default'),
      profileDir,
    ];
  return [...new Set(profileRoots.flatMap((root) => [
    join(root, 'Preferences'),
    join(root, 'Secure Preferences'),
  ]))];
}

function isBridgeExtensionSetting(setting: any, extensionDir: string): boolean {
  const name = setting?.manifest?.name;
  const rawPath = setting?.path ?? setting?.path_safe ?? setting?.location_path;
  if (name === 'repo-harness ChatGPT Bridge') return true;
  if (typeof rawPath !== 'string') return false;
  const normalizedRaw = normalizeComparablePath(rawPath);
  const normalizedExtension = normalizeComparablePath(extensionDir);
  return normalizedRaw === normalizedExtension || normalizedRaw.endsWith('/.ai/harness/chatgpt/bridge-extension');
}

export function inspectBridgeExtensionInstall(profileDir: string, profileDirectory: string | undefined, extensionDir: string): BridgeExtensionInstallStatus {
  let firstReadablePath: string | undefined;
  for (const preferencesPath of profileStateFileCandidates(profileDir, profileDirectory)) {
    if (!existsSync(preferencesPath)) continue;
    try {
      firstReadablePath ??= preferencesPath;
      const preferences = JSON.parse(readFileSync(preferencesPath, 'utf-8')) as any;
      const settings = preferences?.extensions?.settings ?? {};
      for (const [extensionId, setting] of Object.entries(settings)) {
        if (!isBridgeExtensionSetting(setting, extensionDir)) continue;
        const extensionPath = (setting as any)?.path ?? (setting as any)?.path_safe ?? (setting as any)?.location_path;
        const disabled = (setting as any)?.state === 0 || (setting as any)?.disable_reasons !== undefined;
        return {
          status: disabled ? 'disabled' : 'installed',
          preferencesPath,
          extensionId,
          extensionName: (setting as any)?.manifest?.name,
          extensionPath: typeof extensionPath === 'string' ? extensionPath : undefined,
        };
      }
    } catch (error) {
      return {
        status: 'unknown',
        preferencesPath,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  if (firstReadablePath) return { status: 'not_installed', preferencesPath: firstReadablePath };
  return { status: 'unknown', error: 'Chrome profile Preferences file was not found yet.' };
}

function corsHeaders(): HeadersInit {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,accept',
    'access-control-allow-private-network': 'true',
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      ...corsHeaders(),
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export function renderBrowserAuthorizePage(input: {
  profileDir: string;
  profileDirectory?: string;
  selectedProfilePath: string;
  browserChannel: NativeBrowserChannel;
  chatgptUrl: string;
  blockedByDefaultProfile: boolean;
  extensionDir: string;
}): string {
  const profileDir = escapeHtml(input.profileDir);
  const profileDirectory = input.profileDirectory ? escapeHtml(input.profileDirectory) : undefined;
  const selectedProfilePath = escapeHtml(input.selectedProfilePath);
  const browserChannel = escapeHtml(input.browserChannel);
  const chatgptUrl = escapeHtml(input.chatgptUrl);
  const extensionDir = escapeHtml(input.extensionDir);
  const blocked = input.blockedByDefaultProfile;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>repo-harness ChatGPT Authorization</title>
  <style>
    :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #111827; color: #e5e7eb; }
    main { width: min(760px, calc(100vw - 48px)); }
    h1 { font-size: 28px; line-height: 1.2; margin: 0 0 14px; }
    p, li, code { font-size: 15px; line-height: 1.55; }
    code { background: rgba(255,255,255,.1); border-radius: 4px; padding: 2px 5px; }
    .meta { border: 1px solid rgba(255,255,255,.16); border-radius: 8px; padding: 14px 16px; margin: 18px 0; }
    .meta div { margin: 7px 0; overflow-wrap: anywhere; }
    .setup { border: 1px solid rgba(34,197,94,.34); background: rgba(34,197,94,.08); border-radius: 8px; padding: 14px 16px; margin: 18px 0; }
    .setup h2 { font-size: 16px; margin: 0 0 10px; }
    .setup ol { margin: 0; padding-left: 22px; }
    .setup li { margin: 8px 0; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
    button, a.button { display: inline-flex; align-items: center; justify-content: center; min-height: 40px; padding: 0 14px; border: 0; border-radius: 6px; background: #22c55e; color: #052e16; font-weight: 700; text-decoration: none; cursor: pointer; }
    button.secondary { background: #334155; color: #e2e8f0; }
    button:disabled { opacity: .58; cursor: progress; }
    .status { min-height: 24px; margin-top: 14px; color: #bfdbfe; white-space: pre-wrap; }
    .ok { color: #86efac; }
    .warn { color: #fde68a; }
    .bad { color: #fca5a5; }
  </style>
</head>
<body>
  <main>
    <h1>Authorize ChatGPT Web Session</h1>
    <p>This page binds only the ChatGPT Web product session for repo-harness. It does not ask for passwords, copy browser storage, or expose all Chrome sessions.</p>
    <div class="meta">
      <div><strong>Product:</strong> ChatGPT Web</div>
      <div><strong>User data dir:</strong> <code>${profileDir}</code></div>
      ${profileDirectory ? `<div><strong>Chrome profile:</strong> <code>${profileDirectory}</code></div>` : ''}
      <div><strong>Selected profile path:</strong> <code>${selectedProfilePath}</code></div>
      <div><strong>Channel:</strong> <code>${browserChannel}</code></div>
      <div><strong>Bridge extension:</strong> <code>${extensionDir}</code></div>
    </div>
    <section class="setup" aria-label="Authorization steps">
      <h2>Authorization Steps</h2>
      <ol>
        <li>Click <strong>Open Chrome Extensions</strong>, turn on <strong>Developer mode</strong>, then click <strong>Load unpacked</strong>.</li>
        <li>Select the bridge extension directory shown above. Use <strong>Copy Extension Path</strong> if the file picker needs the exact path.</li>
        <li>Open ChatGPT in this same Chrome profile, sign in if needed, make sure the message composer is visible, then click <strong>Bind ChatGPT</strong>.</li>
      </ol>
    </section>
    <div class="actions">
      <button id="authorize" ${blocked ? 'class="secondary"' : ''} type="button">Bind ChatGPT</button>
      <button class="secondary" id="open-login" type="button">Open ChatGPT Login</button>
      <button class="secondary" id="open-extensions" type="button">Open Chrome Extensions</button>
      <button class="secondary" id="copy-extension" type="button">Copy Extension Path</button>
      <button class="secondary" id="refresh-status" type="button">Check Status</button>
    </div>
    <p class="status ${blocked ? 'warn' : ''}" id="status">${blocked ? 'This profile is inside the default Chrome data directory, so authorization uses the product-scoped extension bridge instead of native CDP.' : ''}</p>
  </main>
  <script>
    const status = document.getElementById('status');
    const authorize = document.getElementById('authorize');
    const login = document.getElementById('open-login');
    const extensions = document.getElementById('open-extensions');
    const copyExtension = document.getElementById('copy-extension');
    const refresh = document.getElementById('refresh-status');
    const extensionDir = ${JSON.stringify(input.extensionDir)};
    const setStatus = (text, cls) => {
      status.textContent = text;
      status.className = 'status ' + (cls || '');
    };
    async function postJson(path) {
      const response = await fetch(path, {method: 'POST'});
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message || body.message || response.statusText);
      return body;
    }
    function statusFromBody(result) {
      if (result.status === 'ready') {
        return ['Authorized. ChatGPT composer is visible for this profile. Stop the browser-bind command before running browser-consult --provider bridge.', 'ok'];
      }
      if (result.status === 'extension_not_installed') {
        return ['Bridge extension is not loaded in this Chrome profile yet.\\n1. Click Open Chrome Extensions.\\n2. Turn on Developer mode.\\n3. Click Load unpacked and select:\\n' + extensionDir + '\\n4. Open or refresh ChatGPT, then click Bind ChatGPT again.', 'warn'];
      }
      if (result.status === 'extension_disabled') {
        return ['Bridge extension is installed but disabled. Enable repo-harness ChatGPT Bridge in Chrome Extensions, then open ChatGPT and bind again.', 'warn'];
      }
      if (result.status === 'login_required') {
        return ['ChatGPT is not logged in or the composer is not visible. Click Open ChatGPT Login, sign in, then bind again.\\n' + (result.error?.recovery || ''), 'warn'];
      }
      if (result.status === 'bridge_extension_required' || result.status === 'bridge_extension_disconnected') {
        return [(result.error?.message || 'Bridge extension is not connected yet.') + '\\n' + (result.error?.recovery || ''), 'warn'];
      }
      return [(result.error?.message || 'Authorization failed') + '\\n' + (result.error?.recovery || ''), 'bad'];
    }
    async function refreshStatus() {
      const result = await fetch('/api/extension/status', {headers: {'accept': 'application/json'}}).then((response) => response.json());
      if (result.heartbeatFresh && result.heartbeat?.composerVisible) {
        setStatus('Bridge extension connected. ChatGPT composer is visible. Click Bind ChatGPT to authorize.', 'ok');
        return;
      }
      if (result.install?.status === 'not_installed') {
        setStatus('Bridge extension is not loaded in this Chrome profile yet.\\n1. Click Open Chrome Extensions.\\n2. Turn on Developer mode.\\n3. Click Load unpacked and select:\\n' + extensionDir + '\\n4. Open or refresh ChatGPT, then click Bind ChatGPT again.', 'warn');
        return;
      }
      if (result.install?.status === 'disabled') {
        setStatus('Bridge extension is installed but disabled. Enable repo-harness ChatGPT Bridge in Chrome Extensions, then open ChatGPT and bind again.', 'warn');
        return;
      }
      if (result.install?.status === 'installed') {
        setStatus('Bridge extension is installed, but it is not connected to a visible ChatGPT composer yet. Open ChatGPT in this profile and make sure the message composer is visible.', 'warn');
        return;
      }
      setStatus('Bridge extension status is unknown. Open Chrome Extensions and load the unpacked directory:\\n' + extensionDir, 'warn');
    }
    authorize.addEventListener('click', async () => {
      authorize.disabled = true;
      setStatus('Checking ChatGPT authorization...', 'warn');
      try {
        const result = await postJson('/api/authorize');
        const [text, cls] = statusFromBody(result);
        setStatus(text, cls);
      } catch (error) {
        setStatus(String(error), 'bad');
      } finally {
        authorize.disabled = false;
      }
    });
    login.addEventListener('click', async () => {
      login.disabled = true;
      try {
        const result = await postJson('/api/open-chatgpt');
        setStatus(result.message || 'Opened ChatGPT. Sign in, then return here and bind again.', 'warn');
      } catch (error) {
        setStatus(String(error), 'bad');
      } finally {
        login.disabled = false;
      }
    });
    extensions.addEventListener('click', async () => {
      extensions.disabled = true;
      try {
        const result = await postJson('/api/open-extensions');
        setStatus(result.message || 'Opened Chrome Extensions. Enable Developer mode, click Load unpacked, and select the extension path.', 'warn');
      } catch (error) {
        setStatus(String(error), 'bad');
      } finally {
        extensions.disabled = false;
      }
    });
    copyExtension.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(extensionDir);
        setStatus('Copied extension path. In Chrome Extensions, click Load unpacked and paste/select that directory.', 'ok');
      } catch (_error) {
        setStatus('Extension path:\\n' + extensionDir, 'warn');
      }
    });
    refresh.addEventListener('click', () => refreshStatus().catch((error) => setStatus(String(error), 'bad')));
    refreshStatus().catch(() => undefined);
    setInterval(() => refreshStatus().catch(() => undefined), 3000);
  </script>
  <noscript>JavaScript is required for local authorization. Open ${chatgptUrl}, sign in, then rerun browser-doctor.</noscript>
</body>
</html>
`;
}

export async function startBrowserBindServer(repoRoot: string, opts: BrowserBindServerOptions = {}): Promise<BrowserBindServer> {
  const bindingResult = readBrowserBinding(repoRoot);
  const binding = bindingResult.binding;
  const profileDir = opts.profileDir ? resolve(opts.profileDir) : binding?.profileDir;
  if (!profileDir) {
    throw new Error('browser-bind requires a saved binding or --profile-dir');
  }
  const profileDirectory = opts.profileDirectory ?? binding?.profileDirectory;
  const browserChannel = opts.browserChannel ?? binding?.browserChannel ?? 'chrome';
  const chatgptUrl = opts.chatgptUrl ?? binding?.chatgptUrl ?? 'https://chatgpt.com/';
  const selectedProfilePath = profileDirectory ? join(profileDir, profileDirectory) : profileDir;
  const blockedByDefaultProfile = nativeDebuggingBlockedByDefaultProfile(profileDir, browserChannel);
  const host = opts.host ?? '127.0.0.1';
  const port = opts.port ?? CHATGPT_BRIDGE_DEFAULT_PORT;
  const bridgeUrl = `http://${host}:${port}`;
  const extension = writeChatgptBridgeExtension(repoRoot, bridgeUrl, ensureBridgeToken(repoRoot));
  const timeoutMs = opts.timeoutMs ?? 30_000;
  let heartbeat: { composerVisible: boolean; url?: string; receivedAt: number } | undefined;

  function heartbeatFresh(): boolean {
    return Boolean(heartbeat && Date.now() - heartbeat.receivedAt < 15_000);
  }

  function bridgeStatus() {
    return {
      ok: true,
      status: heartbeatFresh() && heartbeat?.composerVisible === true ? 'ready' : 'pending',
      install: inspectBridgeExtensionInstall(profileDir, profileDirectory, extension.extensionDir),
      heartbeatFresh: heartbeatFresh(),
      heartbeat,
      extensionDir: extension.extensionDir,
    };
  }

  const server = Bun.serve({
    hostname: host,
    port,
    async fetch(request) {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders() });
      }
      const url = new URL(request.url);
      if (request.method === 'GET' && url.pathname === '/') {
        return new Response(renderBrowserAuthorizePage({
          profileDir,
          profileDirectory,
          selectedProfilePath,
          browserChannel,
          chatgptUrl,
          blockedByDefaultProfile,
          extensionDir: extension.extensionDir,
        }), {
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
          },
        });
      }
      if (request.method === 'POST' && url.pathname === '/api/extension/heartbeat') {
        const body = await request.json().catch(() => ({})) as { composerVisible?: unknown; url?: unknown };
        heartbeat = {
          composerVisible: body.composerVisible === true,
          url: typeof body.url === 'string' ? body.url : undefined,
          receivedAt: Date.now(),
        };
        return jsonResponse({ ok: true });
      }
      if (request.method === 'POST' && url.pathname === '/api/open-chatgpt') {
        openNativeBrowserPage(browserChannel, profileDir, chatgptUrl, profileDirectory);
        return jsonResponse({
          ok: true,
          message: 'Opened ChatGPT. Sign in if needed, keep the tab open, then return here and click Bind ChatGPT.',
        });
      }
      if (request.method === 'POST' && url.pathname === '/api/open-extensions') {
        openNativeBrowserPage(browserChannel, profileDir, 'chrome://extensions', profileDirectory);
        return jsonResponse({
          ok: true,
          message: `Opened Chrome Extensions. Enable Developer mode, click Load unpacked, and select ${extension.extensionDir}.`,
        });
      }
      if (request.method === 'GET' && url.pathname === '/api/extension/status') {
        return jsonResponse(bridgeStatus());
      }
      if (request.method === 'POST' && url.pathname === '/api/authorize') {
        const install = inspectBridgeExtensionInstall(profileDir, profileDirectory, extension.extensionDir);
        if (heartbeatFresh() && heartbeat?.composerVisible === true) {
          updateBrowserBindingStatus(repoRoot, 'ready');
          return jsonResponse({
            ok: true,
            status: 'ready',
            profileDir,
            profileDirectory,
            browserChannel,
            url: heartbeat.url,
            bridge: {
              mode: 'extension',
              extensionDir: extension.extensionDir,
            },
          });
        }
        if (heartbeatFresh() && heartbeat?.composerVisible === false) {
          return jsonResponse({
            ok: false,
            status: 'login_required',
            install,
            error: {
              code: 'LOGIN_OR_COMPOSER_NOT_READY',
              message: 'ChatGPT bridge extension is connected, but the ChatGPT composer is not visible yet.',
              recovery: 'Open ChatGPT in this profile, sign in if needed, wait for the message composer, then click Bind ChatGPT again.',
            },
          });
        }
        if (blockedByDefaultProfile) {
          if (install.status === 'not_installed') {
            return jsonResponse({
              ok: false,
              status: 'extension_not_installed',
              install,
              error: {
                code: 'CHATGPT_BRIDGE_EXTENSION_NOT_INSTALLED',
                message: 'ChatGPT bridge extension is not loaded in this Chrome profile.',
                recovery: `Open chrome://extensions, turn on Developer mode, click Load unpacked, select ${extension.extensionDir}, then open or refresh ChatGPT and click Bind ChatGPT again.`,
              },
            });
          }
          if (install.status === 'disabled') {
            return jsonResponse({
              ok: false,
              status: 'extension_disabled',
              install,
              error: {
                code: 'CHATGPT_BRIDGE_EXTENSION_DISABLED',
                message: 'ChatGPT bridge extension is installed but disabled in this Chrome profile.',
                recovery: 'Enable repo-harness ChatGPT Bridge in Chrome Extensions, open ChatGPT, then click Bind ChatGPT again.',
              },
            });
          }
          return jsonResponse({
            ok: false,
            status: 'bridge_extension_disconnected',
            install,
            error: {
              code: 'CHATGPT_BRIDGE_EXTENSION_DISCONNECTED',
              message: 'ChatGPT bridge extension is loaded but not connected to a visible ChatGPT composer yet.',
              recovery: 'Open ChatGPT in this profile, sign in if needed, refresh the ChatGPT tab after loading the extension, then click Bind ChatGPT again.',
            },
          });
        }
        if (!await nativeProviderAvailable()) {
          return jsonResponse({
            ok: false,
            status: 'failed',
            error: {
              code: 'NATIVE_PROVIDER_UNAVAILABLE',
              message: 'Google Chrome native provider is not available',
              recovery: 'Install Google Chrome before binding a native ChatGPT session.',
            },
          });
        }
        const result = await checkNativeChatgptSession({
          profileDir,
          profileDirectory,
          browserChannel,
          chatgptUrl,
          timeoutMs,
        });
        updateBrowserBindingStatus(repoRoot, result.status);
        return jsonResponse({ ok: result.status === 'ready', ...result });
      }
      return jsonResponse({ error: { code: 'NOT_FOUND', message: 'not found' } }, 404);
    },
  });

  const url = `http://${host}:${server.port}/`;
  if (opts.open === true) {
    openNativeBrowserPage(browserChannel, profileDir, url, profileDirectory);
  }
  return {
    url,
    profileDir,
    profileDirectory,
    browserChannel,
    extensionDir: extension.extensionDir,
    stop: () => server.stop(true),
  };
}
