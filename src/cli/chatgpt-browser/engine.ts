import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { startBrowserBindServer } from './bind-server';
import { runBridgeProvider } from './bridge-provider';
import {
  DEFAULT_CHATGPT_URL,
  type BrowserSetupOptions,
  readBrowserBinding,
  updateBrowserBindingStatus,
  writeBrowserBinding,
} from './binding';
import { resolveBrowserOutputPath } from './file-policy';
import { checkNativeChatgptSession, nativeDebuggingBlockedByDefaultProfile, nativeProviderAvailable, runNativeProvider } from './native-provider';
import { buildOracleCommand, probeOracle, resolveOracleBin, runOracleProvider } from './oracle-provider';
import { assemblePromptBundle } from './prompt-assembler';
import {
  cleanupBrowserSessions,
  ensureBrowserSessionRoot,
  listBrowserSessions,
  readBrowserSession,
  resolveConversationUrl,
  writeBrowserSession,
} from './session-store';
import type { BrowserConsultInput, BrowserConsultResult, BrowserProviderName, BrowserSessionStatus, NativeBrowserChannel, StoredBrowserSession, StoredBrowserSessionSummary } from './types';

export interface BrowserDoctorOptions {
  profileDir?: string;
  profileDirectory?: string;
  browserChannel?: NativeBrowserChannel;
  chatgptUrl?: string;
  validateSession?: boolean;
  timeoutMs?: number;
  keepBrowser?: boolean;
  headless?: boolean;
  oracleBin?: string;
}

export type BrowserDoctorStatus = 'ready' | 'unavailable' | 'action_required' | 'deprecated' | 'experimental';

export interface BrowserDoctorAgentAction {
  id: 'chatgpt-oracle-install-pinned' | 'chatgpt-oracle-upgrade-pinned' | 'chatgpt-oracle-fix-configured-source';
  status: 'needs_agent';
  requires_agent: true;
  reason: string;
  risk: string;
  command: string;
  alternatives: string[];
  verification: string;
  automatic: false;
}

const PINNED_ORACLE_INSTALL = 'bun add -g @steipete/oracle@0.14.1';
const PINNED_ORACLE_REPO_LOCAL_INSTALL = 'bun add -D @steipete/oracle@0.14.1';

const EMPTY_ORACLE_CAPABILITIES = {
  browserEngine: false,
  writeOutput: false,
  browserFollowup: false,
  sessionFollowup: false,
  browserArchive: false,
  browserModelStrategy: false,
  browserCookiePath: false,
  browserThinkingTime: false,
  chatgptUrl: false,
  heartbeat: false,
};

export interface BrowserBindOptions {
  profileDir?: string;
  profileDirectory?: string;
  browserChannel?: NativeBrowserChannel;
  chatgptUrl?: string;
  host?: string;
  port?: number;
  timeoutMs?: number;
  open?: boolean;
}

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
  return `Dry run only. ${provider} browser provider is not executed in this command.`;
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

function buildOracleAgentActions(input: {
  provider: BrowserProviderName;
  oraclePresent: boolean;
  oracleCapabilitiesReady: boolean;
  missingOracleCapabilities: string[];
  oracleSource?: string;
}): BrowserDoctorAgentAction[] {
  if (input.provider !== 'oracle') return [];
  const verification = 'repo-harness chatgpt browser-doctor --repo <repo> --provider oracle --json';
  const configuredSourceAction = (reason: string): BrowserDoctorAgentAction => ({
    id: 'chatgpt-oracle-fix-configured-source',
    status: 'needs_agent',
    requires_agent: true,
    reason,
    risk: 'Changes the explicit Oracle binary selection used for GPT Pro browser consults; verify the selected binary before any real run.',
    command: input.oracleSource === '--oracle-bin'
      ? 'repo-harness chatgpt browser-doctor --repo <repo> --provider oracle --oracle-bin <path-to-pinned-oracle> --json'
      : 'REPO_HARNESS_ORACLE_BIN=<path-to-pinned-oracle> repo-harness chatgpt browser-doctor --repo <repo> --provider oracle --json',
    alternatives: [
      'Pass a valid --oracle-bin path for the command.',
      'Set REPO_HARNESS_ORACLE_BIN to a valid pinned oracle binary.',
      'Unset the explicit source only if you intentionally want repo-local or PATH resolution.',
    ],
    verification,
    automatic: false,
  });
  const alternatives = [
    'Pass --oracle-bin <path-to-oracle> for this command.',
    'Set REPO_HARNESS_ORACLE_BIN=<path-to-oracle> for the host runtime.',
    'Install a repo-local node_modules/.bin/oracle in a Node >=24 toolchain.',
  ];
  if (!input.oraclePresent) {
    if (input.oracleSource === '--oracle-bin' || input.oracleSource === 'REPO_HARNESS_ORACLE_BIN') {
      return [configuredSourceAction(
        `Configured Oracle source ${input.oracleSource} did not resolve; installing Oracle globally will not fix the same doctor command until the explicit source points at a valid binary or is removed.`,
      )];
    }
    return [{
      id: 'chatgpt-oracle-install-pinned',
      status: 'needs_agent',
      requires_agent: true,
      reason: input.oracleSource === '--oracle-bin' || input.oracleSource === 'REPO_HARNESS_ORACLE_BIN'
        ? `Configured Oracle source ${input.oracleSource} did not resolve; GPT Pro browser consults require a pinned oracle CLI.`
        : 'Oracle CLI is not installed or not visible; GPT Pro browser consults require a pinned oracle CLI.',
      risk: 'Installs an optional external CLI with its own Node >=24 runtime boundary; do not run from default repo-harness install.',
      command: PINNED_ORACLE_INSTALL,
      alternatives,
      verification,
      automatic: false,
    }];
  }
  if (!input.oracleCapabilitiesReady) {
    if (input.oracleSource === '--oracle-bin' || input.oracleSource === 'REPO_HARNESS_ORACLE_BIN') {
      return [configuredSourceAction(
        `Configured Oracle source ${input.oracleSource} resolved but is missing required browser-mode capabilities: ${input.missingOracleCapabilities.join(', ') || 'nodeCompatible'}.`,
      )];
    }
    const repoLocal = input.oracleSource === 'node_modules/.bin';
    return [{
      id: 'chatgpt-oracle-upgrade-pinned',
      status: 'needs_agent',
      requires_agent: true,
      reason: `Resolved Oracle is missing required browser-mode capabilities: ${input.missingOracleCapabilities.join(', ') || 'nodeCompatible'}.`,
      risk: repoLocal
        ? 'Upgrades an optional repo-local external CLI dev dependency; verify the pinned binary before running any real GPT Pro consult.'
        : 'Upgrades an optional external CLI; verify the pinned binary before running any real GPT Pro consult.',
      command: repoLocal ? PINNED_ORACLE_REPO_LOCAL_INSTALL : PINNED_ORACLE_INSTALL,
      alternatives,
      verification,
      automatic: false,
    }];
  }
  return [];
}

export function runBrowserSetup(repoRoot: string, opts: BrowserSetupOptions = {}): { lines: string[] } {
  const sessionRoot = ensureBrowserSessionRoot(repoRoot);
  const gitignorePath = join(repoRoot, '.gitignore');
  const ignoreLines = [
    '.repo-harness/chatgpt-browser.local.json',
    '.repo-harness/chatgpt-browser.tokens.json',
    '.ai/harness/chatgpt/browser-lock.json',
    '.ai/harness/chatgpt/bridge-extension/',
    '.ai/harness/chatgpt/sessions/',
  ];
  let updated = false;
  if (existsSync(gitignorePath)) {
    const current = Bun.file(gitignorePath);
    // Bun.file().text() is async; keep setup sync by deferring .gitignore
    // mutation to the CLI command implementation if needed in a later phase.
    void current;
  }
  const lines = [
    `[repo-harness chatgpt] Session root: ${sessionRoot}`,
    '[repo-harness chatgpt] Local browser config remains uncommitted.',
    '[repo-harness chatgpt] Recommended .gitignore entries:',
    ...ignoreLines.map((line) => `  ${line}`),
    updated ? '[repo-harness chatgpt] .gitignore updated' : '[repo-harness chatgpt] .gitignore not modified by MVP setup',
  ];

  if (opts.profileDir) {
    const binding = writeBrowserBinding(repoRoot, {
      profileDir: opts.profileDir,
      profileDirectory: opts.profileDirectory,
      browserChannel: opts.browserChannel ?? 'chrome',
      chatgptUrl: opts.chatgptUrl ?? DEFAULT_CHATGPT_URL,
    });
    lines.push(`[repo-harness chatgpt] ChatGPT profile binding: ${binding.profileDir}`);
    if (binding.profileDirectory) lines.push(`[repo-harness chatgpt] Chrome profile: ${binding.profileDirectory}`);
    if (binding.selectedProfilePath) lines.push(`[repo-harness chatgpt] Selected profile path: ${binding.selectedProfilePath}`);
    lines.push(`[repo-harness chatgpt] Browser channel: ${binding.browserChannel}`);
    if (nativeDebuggingBlockedByDefaultProfile(binding.profileDir, binding.browserChannel)) {
      lines.push('[repo-harness chatgpt] Warning: this is the default Chrome data directory. Chrome 136+ blocks native CDP validation for this profile; use a separate automation profile or a session import/bridge path.');
    } else {
      lines.push('[repo-harness chatgpt] Next: run repo-harness chatgpt browser-bind --open, click Bind ChatGPT, then run browser-doctor --provider native --validate-session.');
    }
    return { lines };
  }

  const existing = readBrowserBinding(repoRoot);
  if (existing.binding) {
    lines.push(`[repo-harness chatgpt] Existing ChatGPT profile binding: ${existing.binding.profileDir}`);
    if (existing.binding.profileDirectory) lines.push(`[repo-harness chatgpt] Chrome profile: ${existing.binding.profileDirectory}`);
    if (existing.binding.selectedProfilePath) lines.push(`[repo-harness chatgpt] Selected profile path: ${existing.binding.selectedProfilePath}`);
    lines.push(`[repo-harness chatgpt] Browser channel: ${existing.binding.browserChannel}`);
    if (nativeDebuggingBlockedByDefaultProfile(existing.binding.profileDir, existing.binding.browserChannel)) {
      lines.push('[repo-harness chatgpt] Warning: this is the default Chrome data directory. Chrome 136+ blocks native CDP validation for this profile; use a separate automation profile or a session import/bridge path.');
    } else {
      lines.push('[repo-harness chatgpt] Next: run repo-harness chatgpt browser-bind --open, click Bind ChatGPT, then run browser-doctor --provider native --validate-session.');
    }
  } else {
    lines.push('[repo-harness chatgpt] No ChatGPT profile binding configured.');
    lines.push('[repo-harness chatgpt] Next: repo-harness chatgpt browser-setup --profile-dir <non-default-automation-user-data-dir>, then repo-harness chatgpt browser-bind --open');
  }
  return {
    lines,
  };
}

export async function runBrowserBind(repoRoot: string, opts: BrowserBindOptions = {}): Promise<{ lines: string[]; stop(): void }> {
  const server = await startBrowserBindServer(repoRoot, opts);
  return {
    stop: server.stop,
    lines: [
      `[repo-harness chatgpt] Local authorization URL: ${server.url}`,
      `[repo-harness chatgpt] profileDir=${server.profileDir}`,
      ...(server.profileDirectory ? [`[repo-harness chatgpt] profileDirectory=${server.profileDirectory}`] : []),
      `[repo-harness chatgpt] browserChannel=${server.browserChannel}`,
      `[repo-harness chatgpt] bridgeExtension=${server.extensionDir}`,
      '[repo-harness chatgpt] Keep this command running while you click Bind ChatGPT in the browser.',
      '[repo-harness chatgpt] After authorization succeeds, stop this command before running browser-consult --provider bridge.',
    ],
  };
}

function withBrowserBinding(input: BrowserConsultInput, provider: BrowserProviderName): BrowserConsultInput {
  if (provider !== 'oracle' && provider !== 'native' && provider !== 'bridge') return input;
  if (provider === 'oracle' && input.sourceSessionId) {
    return {
      ...input,
      profileDir: input.profileDir ? resolve(input.profileDir) : undefined,
      chatgptUrl: input.chatgptUrl ?? DEFAULT_CHATGPT_URL,
    };
  }
  const binding = readBrowserBinding(input.repoRoot).binding;
  return {
    ...input,
    profileDir: input.profileDir ? resolve(input.profileDir) : binding?.profileDir,
    profileDirectory: input.profileDirectory ?? binding?.profileDirectory,
    browserChannel: input.browserChannel ?? binding?.browserChannel,
    chatgptUrl: input.chatgptUrl ?? binding?.chatgptUrl ?? DEFAULT_CHATGPT_URL,
  };
}

export async function browserDoctor(
  repoRoot: string,
  provider: BrowserProviderName = 'oracle',
  opts: BrowserDoctorOptions = {},
): Promise<{ status: BrowserDoctorStatus; lines: string[]; json: Record<string, unknown> }> {
  const sessionRoot = ensureBrowserSessionRoot(repoRoot);
  const oracleResolution = resolveOracleBin({ repoRoot, oracleBin: opts.oracleBin });
  const oraclePresent = Boolean(oracleResolution.binary);
  const oracleProbe = oracleResolution.binary ? probeOracle(oracleResolution.binary) : undefined;
  const oracleCapabilities = oracleProbe?.capabilities ?? EMPTY_ORACLE_CAPABILITIES;
  const missingOracleCapabilities = Object.entries(oracleCapabilities)
    .filter(([, supported]) => supported !== true)
    .map(([capability]) => capability);
  const oracleCapabilitiesReady = Boolean(oracleProbe?.nodeCompatible && missingOracleCapabilities.length === 0);
  const nativePresent = await nativeProviderAvailable();
  const bindingResult = readBrowserBinding(repoRoot);
  const binding = bindingResult.binding;
  const profileDir = opts.profileDir ? resolve(opts.profileDir) : binding?.profileDir;
  const profileDirectory = opts.profileDirectory ?? binding?.profileDirectory;
  const browserChannel = opts.browserChannel ?? binding?.browserChannel ?? 'chrome';
  const chatgptUrl = opts.chatgptUrl ?? binding?.chatgptUrl ?? DEFAULT_CHATGPT_URL;
  const defaultProfileBlocked = profileDir
    ? nativeDebuggingBlockedByDefaultProfile(profileDir, browserChannel)
    : false;
  const nativeProductSessionStatus = profileDir
    ? (defaultProfileBlocked ? 'blocked_default_profile' : opts.validateSession === true ? 'checking' : binding ? 'bound' : 'ad_hoc')
    : 'not_configured';
  const validation = provider === 'native' && opts.validateSession === true && nativePresent && profileDir && !defaultProfileBlocked
    ? await checkNativeChatgptSession({
      profileDir,
      profileDirectory,
      browserChannel,
      chatgptUrl,
      timeoutMs: opts.timeoutMs,
      keepBrowser: opts.keepBrowser,
      headless: opts.headless,
    })
    : undefined;
  const productSessionStatus = validation?.status ?? nativeProductSessionStatus;
  if (validation && binding && !opts.profileDir) {
    updateBrowserBindingStatus(repoRoot, validation.status);
  }
  const nativeReady = nativePresent && Boolean(profileDir) && !defaultProfileBlocked && (opts.validateSession !== true || validation?.status === 'ready');
  const bridgeReady = Boolean(profileDir);
  // Oracle is the main path: ready iff a resolved binary probes with the
  // browser-mode capabilities we depend on. native is deprecated; bridge is
  // experimental. We no longer overload a single `partial` for all three.
  const status: BrowserDoctorStatus = provider === 'oracle'
    ? (!oraclePresent ? 'unavailable' : oracleCapabilitiesReady ? 'ready' : 'action_required')
    : provider === 'native'
      ? 'deprecated'
      : 'experimental';
  const next = [
    'repo-harness chatgpt browser-consult --dry-run --prompt "Reply exactly OK"',
  ];
  if (provider === 'oracle') {
    if (!oraclePresent) {
      next.push('Install oracle (pin the version) or pass --oracle-bin / set REPO_HARNESS_ORACLE_BIN before non-dry-run execution.');
    } else if (!oracleCapabilitiesReady) {
      next.push('Resolved oracle binary did not report the required browser-mode flags; upgrade oracle or check `oracle --help`.');
    } else {
      next.push('repo-harness chatgpt browser-consult --provider oracle --prompt "Reply exactly OK"');
    }
  } else if (provider === 'native') {
    next.push('The native CDP provider is deprecated; use --provider oracle. Native remains only for short-term diagnostics.');
    if (!nativePresent) {
      next.push('Install Google Chrome before native provider execution.');
    } else if (!profileDir) {
      next.push('repo-harness chatgpt browser-setup --profile-dir <non-default-automation-user-data-dir>');
      next.push('repo-harness chatgpt browser-bind --open');
    } else if (defaultProfileBlocked) {
      next.push('Chrome 136+ blocks native CDP against the default Chrome profile. Use a separate automation user-data-dir or a domain-scoped ChatGPT session import/bridge path.');
    } else if (opts.validateSession !== true) {
      next.push('repo-harness chatgpt browser-doctor --provider native --validate-session');
    } else if (validation?.status !== 'ready') {
      next.push(validation?.error?.recovery ?? 'Run browser-bind --open, sign in from the local authorization page if needed, then validate again.');
    } else {
      next.push('repo-harness chatgpt browser-consult --provider native --prompt "Reply exactly OK"');
    }
  } else if (provider === 'bridge') {
    if (!profileDir) {
      next.push('repo-harness chatgpt browser-setup --profile-dir <user-selected-chrome-profile-dir>');
      next.push('repo-harness chatgpt browser-bind --open');
    } else {
      next.push('repo-harness chatgpt browser-bind --open');
      next.push('repo-harness chatgpt browser-consult --provider bridge --prompt "Reply exactly OK"');
    }
  }
  const oracleCode = provider === 'oracle'
    ? (!oraclePresent ? 'ORACLE_NOT_INSTALLED' : oracleCapabilitiesReady ? undefined : 'ORACLE_INCOMPATIBLE')
    : provider === 'native' ? 'NATIVE_PROVIDER_DEPRECATED' : 'BRIDGE_EXPERIMENTAL';
  const oracleError = provider === 'oracle'
    ? oracleResolution.error ?? (!oracleCapabilitiesReady && oraclePresent ? {
      code: 'ORACLE_INCOMPATIBLE',
      message: `oracle binary did not report required browser-mode capabilities: ${missingOracleCapabilities.join(', ')}`,
      recovery: 'Upgrade oracle or check `oracle --help`; repo-harness requires every flag it may send at runtime.',
    } : undefined)
    : undefined;
  const agentActions = buildOracleAgentActions({
    provider,
    oraclePresent,
    oracleCapabilitiesReady,
    missingOracleCapabilities,
    oracleSource: oracleResolution.source,
  });
  const json = {
    status,
    code: oracleCode,
    provider,
    agent_actions: agentActions,
    posture: { oracle: 'default', native: 'deprecated', bridge: 'experimental' },
    repo: { root: repoRoot, sessionRoot },
    oracle: {
      installed: oraclePresent,
      binary: oracleResolution.binary,
      resolvedFrom: oracleResolution.source,
      version: oracleProbe?.version,
      nodeCompatible: oracleProbe?.nodeCompatible ?? false,
      capabilities: oracleCapabilities,
      missingCapabilities: missingOracleCapabilities,
      error: oracleError,
    },
    native: {
      deprecated: true,
      installed: nativePresent,
      driver: 'chrome-cdp',
      defaultChannel: 'chrome',
      productSession: {
        status: productSessionStatus,
        configPath: bindingResult.path,
        configError: bindingResult.error,
        profileDir,
        profileDirectory,
        selectedProfilePath: binding?.selectedProfilePath ?? (profileDir && profileDirectory ? join(profileDir, profileDirectory) : profileDir),
        browserChannel,
        chatgptUrl,
        blockedByDefaultProfile: defaultProfileBlocked,
        lastCheckedAt: binding?.lastCheckedAt,
        lastStatus: binding?.lastStatus,
        validation,
      },
    },
    bridge: {
      experimental: true,
      installed: bridgeReady,
      driver: 'chrome-extension-localhost',
      productSession: {
        status: profileDir ? 'configured' : 'not_configured',
        profileDir,
        profileDirectory,
        selectedProfilePath: binding?.selectedProfilePath ?? (profileDir && profileDirectory ? join(profileDir, profileDirectory) : profileDir),
        browserChannel,
        chatgptUrl,
      },
    },
    browser: { mode: 'manual-login', opensBrowser: provider === 'native' && opts.validateSession === true && !defaultProfileBlocked },
    next,
  };
  return {
    status,
    json,
    lines: [
      `[repo-harness chatgpt] status=${status}`,
      `[repo-harness chatgpt] provider=${provider}`,
      `[repo-harness chatgpt] sessionRoot=${sessionRoot}`,
      `[repo-harness chatgpt] oracle=${oracleResolution.binary ?? 'missing'}${oracleProbe?.version ? ` (v${oracleProbe.version})` : ''}`,
      `[repo-harness chatgpt] native=${nativePresent ? 'chrome-cdp (deprecated)' : 'missing'}`,
      `[repo-harness chatgpt] chatgptSession=${productSessionStatus}`,
      ...(profileDir ? [`[repo-harness chatgpt] profileDir=${profileDir}`] : []),
      ...(profileDirectory ? [`[repo-harness chatgpt] profileDirectory=${profileDirectory}`] : []),
      ...(defaultProfileBlocked ? ['[repo-harness chatgpt] defaultProfileCdpBlocked=true'] : []),
      ...(profileDir ? ['[repo-harness chatgpt] bindCommand=repo-harness chatgpt browser-bind --open'] : []),
      ...agentActions.map((action) => `[repo-harness chatgpt] agentAction=${action.id} command=${action.command}`),
      ...(bindingResult.error ? [`[repo-harness chatgpt] bindingError=${bindingResult.error}`] : []),
      ...(validation?.error ? [`[repo-harness chatgpt] validationError=${validation.error.message}`] : []),
    ],
  };
}

export async function runBrowserConsult(input: BrowserConsultInput): Promise<BrowserConsultResult> {
  const provider = input.provider ?? 'oracle';
  const effectiveInput = withBrowserBinding(input, provider);
  assertOutputTarget(effectiveInput);
  const bundle = assemblePromptBundle(effectiveInput);
  if (effectiveInput.dryRun !== true) {
    if (provider === 'oracle') {
      const oracle = await runOracleProvider(effectiveInput, bundle);
      return writeBrowserSession({
        input: effectiveInput,
        provider,
        status: oracle.status,
        bundle,
        output: oracle.output,
        error: oracle.error,
        conversationUrl: oracle.conversationUrl,
        providerSessionId: oracle.providerSessionId,
        oracle: {
          binary: oracle.oracleBinary,
          version: oracle.oracleVersion,
          captureStatus: oracle.status === 'completed' ? 'completed' : oracle.status === 'recoverable' ? 'recoverable' : undefined,
        },
        artifacts: oracle.artifacts,
        command: oracle.command,
      });
    }
    if (provider === 'bridge') {
      const bridge = await runBridgeProvider(effectiveInput, bundle);
      return writeBrowserSession({
        input: effectiveInput,
        provider,
        status: bridge.status,
        bundle,
        output: bridge.output,
        conversationUrl: bridge.conversationUrl,
        error: bridge.error,
      });
    }
    const native = await runNativeProvider(effectiveInput, bundle);
    return writeBrowserSession({
      input: effectiveInput,
      provider,
      status: native.status,
      bundle,
      output: native.output,
      conversationUrl: native.conversationUrl,
      error: native.error,
    });
  }
  const command = provider === 'oracle' ? ['oracle', ...buildOracleCommand(effectiveInput)] : undefined;
  return writeBrowserSession({
    input: effectiveInput,
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

const FOLLOWUP_RESUMABLE_STATUSES = new Set(['completed', 'recoverable', 'incomplete_capture', 'dry_run']);

export async function runBrowserFollowup(input: Omit<BrowserConsultInput, 'sourceSessionId'> & { sessionId: string }): Promise<BrowserConsultResult> {
  const existing = readBrowserSession(input.repoRoot, input.sessionId);
  const provider = input.provider ?? existing.meta.provider;
  // A follow-up reattaches to the same ChatGPT conversation; only resume from a
  // session that actually reached a resumable terminal state. A `failed`/`cancelled`
  // source has no conversation to continue.
  if (input.dryRun !== true && !FOLLOWUP_RESUMABLE_STATUSES.has(existing.meta.status)) {
    throw new Error(`cannot follow up from session ${input.sessionId} with status "${existing.meta.status}" (expected completed/recoverable)`);
  }
  return runBrowserConsult({
    ...input,
    title: input.title ?? `followup ${input.sessionId}`,
    sourceSessionId: input.sessionId,
    providerSessionId: input.providerSessionId ?? existing.meta.providerSessionId,
    parentProviderSessionId: existing.meta.providerSessionId,
    model: input.model ?? existing.meta.model.requested,
    thinking: input.thinking ?? existing.meta.model.thinking,
    provider,
    chatgptUrl: input.chatgptUrl ?? existing.meta.browser.conversationUrl ?? existing.meta.browser.chatgptUrl,
    profileDir: input.profileDir ?? existing.meta.browser.profileDir,
    profileDirectory: input.profileDirectory ?? existing.meta.browser.profileDirectory,
    browserChannel: input.browserChannel ?? existing.meta.browser.channel,
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
