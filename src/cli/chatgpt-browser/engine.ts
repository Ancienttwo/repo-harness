import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { resolveBrowserOutputPath } from './file-policy';
import { nativeProviderAvailable, runNativeProvider } from './native-provider';
import { buildOracleCommand, runOracleProvider } from './oracle-provider';
import { assemblePromptBundle } from './prompt-assembler';
import {
  cleanupBrowserSessions,
  ensureBrowserSessionRoot,
  listBrowserSessions,
  readBrowserSession,
  resolveConversationUrl,
  writeBrowserSession,
} from './session-store';
import type { BrowserConsultInput, BrowserConsultResult, BrowserProviderName, BrowserSessionStatus, StoredBrowserSession, StoredBrowserSessionSummary } from './types';

function providerOutput(provider: BrowserProviderName, command?: string[]): string {
  if (provider === 'oracle') {
    return [
      'Dry run only. No browser was opened.',
      '',
      'Oracle command:',
      '',
      '```bash',
      command?.map((part) => JSON.stringify(part)).join(' ') ?? 'oracle --engine browser ...',
      '```',
    ].join('\n');
  }
  return 'Dry run only. Native browser provider is not executed in this command.';
}

export function resolveRepoRoot(input = '.'): string {
  return resolve(input);
}

function assertOutputTarget(input: BrowserConsultInput): void {
  if (!input.writeOutput) return;
  const decision = resolveBrowserOutputPath(input.repoRoot, input.writeOutput, {
    policy: input.writeOutputPolicy ?? 'cli',
    allowAbsolute: input.allowAbsoluteOutput === true,
    overwrite: input.overwriteOutput === true,
  });
  if (!decision.ok) throw new Error(decision.reason);
}

export function runBrowserSetup(repoRoot: string): { lines: string[] } {
  const sessionRoot = ensureBrowserSessionRoot(repoRoot);
  const gitignorePath = join(repoRoot, '.gitignore');
  const ignoreLines = [
    '.repo-harness/chatgpt-browser.local.json',
    '.repo-harness/chatgpt-browser.tokens.json',
    '.ai/harness/chatgpt/browser-lock.json',
    '.ai/harness/chatgpt/tmp/',
    '.ai/harness/chatgpt/sessions/',
  ];
  let updated = false;
  if (existsSync(gitignorePath)) {
    const current = Bun.file(gitignorePath);
    // Bun.file().text() is async; keep setup sync by deferring .gitignore
    // mutation to the CLI command implementation if needed in a later phase.
    void current;
  }
  return {
    lines: [
      `[repo-harness chatgpt] Session root: ${sessionRoot}`,
      '[repo-harness chatgpt] Local browser config remains uncommitted.',
      '[repo-harness chatgpt] Recommended .gitignore entries:',
      ...ignoreLines.map((line) => `  ${line}`),
      updated ? '[repo-harness chatgpt] .gitignore updated' : '[repo-harness chatgpt] .gitignore not modified by MVP setup',
    ],
  };
}

export async function browserDoctor(repoRoot: string, provider: BrowserProviderName = 'oracle'): Promise<{ status: 'ready' | 'partial'; lines: string[]; json: Record<string, unknown> }> {
  const sessionRoot = ensureBrowserSessionRoot(repoRoot);
  const oraclePresent = Bun.which('oracle') !== null;
  const nativePresent = await nativeProviderAvailable();
  const status = provider === 'oracle' && !oraclePresent ? 'partial' : provider === 'native' && !nativePresent ? 'partial' : 'ready';
  const json = {
    status,
    provider,
    repo: { root: repoRoot, sessionRoot },
    oracle: { installed: oraclePresent, path: Bun.which('oracle') },
    native: { installed: nativePresent, driver: 'chrome-cdp', defaultChannel: 'chrome' },
    browser: { mode: 'manual-login', opensBrowser: false },
    next: [
      'repo-harness chatgpt browser-consult --dry-run --prompt "Reply exactly OK"',
      provider === 'oracle' ? 'Install oracle before non-dry-run provider execution.' : 'Run with --provider native --browser-channel chrome --keep-browser for first login, then retry.',
    ],
  };
  return {
    status,
    json,
    lines: [
      `[repo-harness chatgpt] status=${status}`,
      `[repo-harness chatgpt] provider=${provider}`,
      `[repo-harness chatgpt] sessionRoot=${sessionRoot}`,
      `[repo-harness chatgpt] oracle=${oraclePresent ? Bun.which('oracle') : 'missing'}`,
      `[repo-harness chatgpt] native=${nativePresent ? 'chrome-cdp' : 'missing'}`,
    ],
  };
}

export async function runBrowserConsult(input: BrowserConsultInput): Promise<BrowserConsultResult> {
  const provider = input.provider ?? 'oracle';
  assertOutputTarget(input);
  const bundle = assemblePromptBundle(input);
  if (input.dryRun !== true) {
    if (provider === 'oracle') {
      const oracle = runOracleProvider(input, bundle);
      return writeBrowserSession({
        input,
        provider,
        status: oracle.status,
        bundle,
        output: oracle.output,
        error: oracle.error,
        conversationUrl: oracle.conversationUrl,
        providerSessionId: oracle.providerSessionId,
        artifacts: oracle.artifacts,
        command: oracle.command,
      });
    }
    const native = await runNativeProvider(input, bundle);
    return writeBrowserSession({
      input,
      provider,
      status: native.status,
      bundle,
      output: native.output,
      conversationUrl: native.conversationUrl,
      error: native.error,
    });
  }
  const command = provider === 'oracle' ? ['oracle', ...buildOracleCommand(input)] : undefined;
  return writeBrowserSession({
    input,
    provider,
    status: 'dry_run',
    bundle,
    output: providerOutput(provider, command),
    command,
  });
}

export function readSession(repoRoot: string, sessionId: string): StoredBrowserSession {
  return readBrowserSession(repoRoot, sessionId);
}

export function listSessions(repoRoot: string, limit?: number): StoredBrowserSessionSummary[] {
  return listBrowserSessions(repoRoot, undefined, limit);
}

export async function runBrowserFollowup(input: Omit<BrowserConsultInput, 'sourceSessionId'> & { sessionId: string }): Promise<BrowserConsultResult> {
  const existing = readBrowserSession(input.repoRoot, input.sessionId);
  const provider = input.provider ?? existing.meta.provider;
  return runBrowserConsult({
    ...input,
    title: input.title ?? `followup ${input.sessionId}`,
    sourceSessionId: input.sessionId,
    providerSessionId: input.providerSessionId ?? existing.meta.providerSessionId,
    model: input.model ?? existing.meta.model.requested,
    thinking: input.thinking ?? existing.meta.model.thinking,
    provider,
    chatgptUrl: input.chatgptUrl ?? existing.meta.browser.conversationUrl ?? existing.meta.browser.chatgptUrl,
  });
}

export function openSession(repoRoot: string, sessionId: string, launch = false): { url: string; launched: boolean } {
  const url = resolveConversationUrl(repoRoot, sessionId);
  if (launch) {
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    spawnSync(opener, args, { stdio: 'ignore' });
  }
  return { url, launched: launch };
}

export function cleanupSessions(repoRoot: string, opts: { olderThanDays?: number; status?: BrowserSessionStatus; dryRun?: boolean; limit?: number }) {
  return cleanupBrowserSessions(repoRoot, opts);
}
