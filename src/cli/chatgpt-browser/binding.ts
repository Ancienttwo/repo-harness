import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import type { NativeBrowserChannel } from './types';

export const CHATGPT_BROWSER_BINDING_RELATIVE_PATH = '.repo-harness/chatgpt-browser.local.json';
export const DEFAULT_CHATGPT_URL = 'https://chatgpt.com/';

export interface ChatgptBrowserBinding {
  version: 1;
  product: 'chatgpt';
  profileDir: string;
  profileDirectory?: string;
  selectedProfilePath?: string;
  browserChannel: NativeBrowserChannel;
  chatgptUrl: string;
  /** Per-binding capability token; the localhost bridge rejects callers that do not present it. */
  bridgeToken?: string;
  updatedAt: string;
  lastCheckedAt?: string;
  lastStatus?: 'ready' | 'login_required' | 'failed';
}

export function generateBridgeToken(): string {
  return randomBytes(24).toString('base64url');
}

export interface BrowserSetupOptions {
  profileDir?: string;
  profileDirectory?: string;
  browserChannel?: NativeBrowserChannel;
  chatgptUrl?: string;
}

export function resolveBrowserBindingPath(repoRoot: string): string {
  return join(repoRoot, CHATGPT_BROWSER_BINDING_RELATIVE_PATH);
}

export function normalizeChatgptUrl(input: string | undefined): string {
  const raw = (input ?? DEFAULT_CHATGPT_URL).trim() || DEFAULT_CHATGPT_URL;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch (_error) {
    throw new Error(`invalid --chatgpt-url "${input}"`);
  }
  if (parsed.protocol !== 'https:' || !['chatgpt.com', 'chat.openai.com'].includes(parsed.hostname)) {
    throw new Error(`invalid --chatgpt-url "${input}" (expected https://chatgpt.com/)`);
  }
  return parsed.toString();
}

function resolveProfileSelection(profileDir: string, profileDirectory?: string): { profileDir: string; profileDirectory?: string; selectedProfilePath: string } {
  const selectedProfilePath = resolve(profileDir);
  if (profileDirectory) {
    const userDataDir = selectedProfilePath;
    return {
      profileDir: userDataDir,
      profileDirectory,
      selectedProfilePath: join(userDataDir, profileDirectory),
    };
  }

  const parent = dirname(selectedProfilePath);
  if (existsSync(join(selectedProfilePath, 'Preferences')) && existsSync(join(parent, 'Local State'))) {
    return {
      profileDir: parent,
      profileDirectory: basename(selectedProfilePath),
      selectedProfilePath,
    };
  }

  return {
    profileDir: selectedProfilePath,
    selectedProfilePath,
  };
}

export function readBrowserBinding(repoRoot: string): { path: string; binding?: ChatgptBrowserBinding; error?: string } {
  const path = resolveBrowserBindingPath(repoRoot);
  if (!existsSync(path)) return { path };
  try {
    const binding = JSON.parse(readFileSync(path, 'utf-8')) as ChatgptBrowserBinding;
    if (binding.version !== 1 || binding.product !== 'chatgpt' || !binding.profileDir) {
      return { path, error: 'binding file is malformed' };
    }
    return { path, binding };
  } catch (error) {
    return { path, error: error instanceof Error ? error.message : String(error) };
  }
}

export function writeBrowserBinding(repoRoot: string, opts: BrowserSetupOptions & { profileDir: string; browserChannel: NativeBrowserChannel }): ChatgptBrowserBinding {
  const selection = resolveProfileSelection(opts.profileDir, opts.profileDirectory);
  const binding: ChatgptBrowserBinding = {
    version: 1,
    product: 'chatgpt',
    profileDir: selection.profileDir,
    profileDirectory: selection.profileDirectory,
    selectedProfilePath: selection.selectedProfilePath,
    browserChannel: opts.browserChannel,
    chatgptUrl: normalizeChatgptUrl(opts.chatgptUrl),
    bridgeToken: generateBridgeToken(),
    updatedAt: new Date().toISOString(),
  };
  const bindingPath = resolveBrowserBindingPath(repoRoot);
  mkdirSync(dirname(bindingPath), { recursive: true });
  writeFileSync(bindingPath, `${JSON.stringify(binding, null, 2)}\n`, 'utf-8');
  return binding;
}

/**
 * Return the binding's bridge capability token, lazily generating and persisting
 * one for pre-existing bindings that predate the token. Returns undefined when no
 * binding file exists (callers fall back to an ephemeral per-run token).
 */
export function ensureBridgeToken(repoRoot: string): string | undefined {
  const current = readBrowserBinding(repoRoot).binding;
  if (!current) return undefined;
  if (current.bridgeToken) return current.bridgeToken;
  const bridgeToken = generateBridgeToken();
  const next: ChatgptBrowserBinding = { ...current, bridgeToken, updatedAt: new Date().toISOString() };
  writeFileSync(resolveBrowserBindingPath(repoRoot), `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
  return bridgeToken;
}

export function updateBrowserBindingStatus(
  repoRoot: string,
  status: 'ready' | 'login_required' | 'failed',
): ChatgptBrowserBinding | undefined {
  const current = readBrowserBinding(repoRoot).binding;
  if (!current) return undefined;
  const next: ChatgptBrowserBinding = {
    ...current,
    lastCheckedAt: new Date().toISOString(),
    lastStatus: status,
  };
  writeFileSync(resolveBrowserBindingPath(repoRoot), `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
  return next;
}
