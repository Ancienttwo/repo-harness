import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { basename, dirname, join, relative } from 'path';
import { resolveBrowserOutputPath } from './file-policy';
import type {
  BrowserConsultInput,
  BrowserConsultResult,
  BrowserImportedArtifact,
  BrowserProviderName,
  BrowserSessionMeta,
  BrowserSessionPaths,
  BrowserSessionStatus,
  PromptBundle,
  StoredBrowserSession,
  StoredBrowserSessionSummary,
} from './types';

export const DEFAULT_SESSION_ROOT = '.ai/harness/chatgpt/sessions';
export const BROWSER_SESSION_ID_PATTERN = /^chgpt_\d{8}_\d{6}_[a-z0-9-]+(?:-\d+)?$/;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'consult';
}

function timestamp(date = new Date()): string {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const sec = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}_${hh}${min}${sec}`;
}

function sessionRoot(repoRoot: string, customRoot?: string): string {
  return customRoot?.startsWith('/') ? customRoot : join(repoRoot, customRoot ?? DEFAULT_SESSION_ROOT);
}

function assertValidSessionId(sessionId: string): void {
  if (!BROWSER_SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error(`invalid ChatGPT browser session id: ${sessionId}`);
  }
}

export function createBrowserSessionId(input: Pick<BrowserConsultInput, 'title' | 'prompt'>, date = new Date()): string {
  return `chgpt_${timestamp(date)}_${slugify(input.title ?? input.prompt.split(/\r?\n/)[0] ?? 'consult')}`;
}

export function browserSessionPaths(repoRoot: string, sessionId: string, customRoot?: string): BrowserSessionPaths {
  assertValidSessionId(sessionId);
  const root = sessionRoot(repoRoot, customRoot);
  const sessionDir = join(root, sessionId);
  return {
    sessionDir,
    prompt: join(sessionDir, 'prompt.md'),
    transcript: join(sessionDir, 'transcript.md'),
    output: join(sessionDir, 'output.md'),
    events: join(sessionDir, 'events.jsonl'),
    artifactsDir: join(sessionDir, 'artifacts'),
  };
}

function rel(repoRoot: string, path: string): string {
  return relative(repoRoot, path).split('\\').join('/');
}

function renderTranscript(meta: BrowserSessionMeta, bundle: PromptBundle, output: string): string {
  return [
    `# ChatGPT Browser Session: ${meta.sessionId}`,
    '',
    `- Status: ${meta.status}`,
    `- Provider: ${meta.provider}`,
    `- Model: ${meta.model.requested ?? 'current'}`,
    `- Thinking: ${meta.model.thinking ?? 'unspecified'}`,
    ...(meta.sourceSessionId ? [`- Source Session: ${meta.sourceSessionId}`] : []),
    ...(meta.browser.conversationUrl ? [`- Conversation: ${meta.browser.conversationUrl}`] : []),
    `- Created: ${meta.createdAt}`,
    '',
    '## User Turn 1',
    '',
    bundle.rendered.trimEnd(),
    '',
    '## Assistant Turn 1',
    '',
    output.trimEnd(),
    '',
  ].join('\n');
}

function copyArtifacts(artifactsDir: string, artifacts?: BrowserImportedArtifact[]): Array<{ fileName: string; size: number; sourcePath?: string }> {
  if (!artifacts?.length) return [];
  return artifacts.map((artifact) => {
    const targetName = basename(artifact.fileName);
    copyFileSync(artifact.sourcePath, join(artifactsDir, targetName));
    return { fileName: targetName, size: artifact.size, sourcePath: artifact.sourcePath };
  });
}

function allocateBrowserSessionPaths(input: BrowserConsultInput): { sessionId: string; paths: BrowserSessionPaths } {
  const baseSessionId = createBrowserSessionId(input);
  const root = sessionRoot(input.repoRoot, input.sessionRoot);
  mkdirSync(root, { recursive: true });
  for (let attempt = 1; attempt <= 100; attempt += 1) {
    const sessionId = attempt === 1 ? baseSessionId : `${baseSessionId}-${attempt}`;
    const paths = browserSessionPaths(input.repoRoot, sessionId, input.sessionRoot);
    try {
      mkdirSync(paths.sessionDir);
      mkdirSync(paths.artifactsDir);
      return { sessionId, paths };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue;
      throw error;
    }
  }
  throw new Error(`could not allocate unique ChatGPT browser session id for ${baseSessionId}`);
}

export function writeBrowserSession(opts: {
  input: BrowserConsultInput;
  provider: BrowserProviderName;
  status: BrowserSessionStatus;
  bundle: PromptBundle;
  output: string;
  error?: { code: string; message: string; recovery?: string };
  conversationUrl?: string;
  providerSessionId?: string;
  parentProviderSessionId?: string;
  oracle?: { binary?: string; version?: string; captureStatus?: 'completed' | 'recoverable' };
  artifacts?: BrowserImportedArtifact[];
  command?: string[];
}): BrowserConsultResult {
  const outputTarget = opts.input.writeOutput
    ? resolveBrowserOutputPath(opts.input.repoRoot, opts.input.writeOutput, {
      policy: opts.input.writeOutputPolicy ?? 'cli',
      allowAbsolute: opts.input.allowAbsoluteOutput === true,
      overwrite: opts.input.overwriteOutput === true,
    })
    : undefined;
  if (outputTarget && !outputTarget.ok) throw new Error(outputTarget.reason);

  const { sessionId, paths } = allocateBrowserSessionPaths(opts.input);
  const now = new Date().toISOString();
  const copiedArtifacts = copyArtifacts(paths.artifactsDir, opts.artifacts);
  const meta: BrowserSessionMeta = {
    version: 1,
    sessionId,
    engine: 'chatgpt-browser',
    provider: opts.provider,
    status: opts.status,
    repo: opts.input.repoRoot,
    createdAt: now,
    updatedAt: now,
    model: {
      requested: opts.input.model,
      thinking: opts.input.thinking,
      verified: false,
    },
    browser: {
      mode: 'manual-login',
      chatgptUrl: opts.input.chatgptUrl ?? 'https://chatgpt.com/',
      channel: opts.input.browserChannel,
      profileDir: opts.input.profileDir,
      profileDirectory: opts.input.profileDirectory,
      selectedProfilePath: opts.input.profileDirectory ? join(opts.input.profileDir ?? '', opts.input.profileDirectory) : opts.input.profileDir,
      conversationUrl: opts.conversationUrl,
    },
    input: {
      promptPath: 'prompt.md',
      files: opts.bundle.files.map((file) => ({
        path: file.path,
        delivery: file.delivery,
        sha256: file.sha256,
        size: file.size,
      })),
      followups: opts.bundle.followups.length,
    },
    output: {
      outputPath: 'output.md',
      transcriptPath: 'transcript.md',
      artifactsDir: 'artifacts',
      writeOutput: opts.input.writeOutput,
      artifacts: copiedArtifacts,
    },
    diagnostics: {
      dryRun: opts.input.dryRun === true,
      reattachable: opts.status === 'incomplete_capture' || opts.status === 'recoverable',
      lastCaptureAt: now,
    },
    sourceSessionId: opts.input.sourceSessionId,
    providerSessionId: opts.providerSessionId,
    parentProviderSessionId: opts.parentProviderSessionId ?? opts.input.parentProviderSessionId,
    oracle: opts.oracle,
    error: opts.error,
  };
  writeFileSync(join(paths.sessionDir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n', 'utf-8');
  writeFileSync(paths.prompt, opts.bundle.rendered, 'utf-8');
  writeFileSync(paths.output, opts.output.trimEnd() + '\n', 'utf-8');
  writeFileSync(paths.transcript, renderTranscript(meta, opts.bundle, opts.output), 'utf-8');
  writeFileSync(paths.events, JSON.stringify({ ts: now, event: 'session.created', sessionId, status: opts.status }) + '\n', 'utf-8');
  if (outputTarget?.ok) {
    mkdirSync(dirname(outputTarget.absolutePath), { recursive: true });
    writeFileSync(outputTarget.absolutePath, opts.output.trimEnd() + '\n', 'utf-8');
  }
  return {
    sessionId,
    status: opts.status,
    output: opts.output,
    conversationUrl: opts.conversationUrl,
    paths,
    meta,
    dryRun: opts.input.dryRun === true ? {
      promptChars: opts.bundle.rendered.length,
      totalChars: opts.bundle.totalChars,
      files: opts.bundle.files.map((file) => ({ path: file.path, size: file.size, chars: file.chars, sha256: file.sha256 })),
      command: opts.command,
    } : undefined,
    error: opts.error,
    artifacts: opts.artifacts,
  };
}

export function listBrowserSessions(repoRoot: string, customRoot?: string, limit = 20): StoredBrowserSessionSummary[] {
  const root = sessionRoot(repoRoot, customRoot);
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, entry.name, 'meta.json'))
    .filter((path) => existsSync(path))
    .map((path) => JSON.parse(readFileSync(path, 'utf-8')) as BrowserSessionMeta)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map((meta) => ({
      sessionId: meta.sessionId,
      status: meta.status,
      provider: meta.provider,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      title: basename(meta.sessionId).replace(/^chgpt_\d{8}_\d{6}_/, ''),
      outputPath: `${DEFAULT_SESSION_ROOT}/${meta.sessionId}/output.md`,
      transcriptPath: `${DEFAULT_SESSION_ROOT}/${meta.sessionId}/transcript.md`,
      conversationUrl: meta.browser.conversationUrl,
    }));
}

export function readBrowserSession(repoRoot: string, sessionId: string, customRoot?: string): StoredBrowserSession {
  const paths = browserSessionPaths(repoRoot, sessionId, customRoot);
  if (!existsSync(join(paths.sessionDir, 'meta.json'))) throw new Error(`session not found: ${sessionId}`);
  return {
    meta: JSON.parse(readFileSync(join(paths.sessionDir, 'meta.json'), 'utf-8')) as BrowserSessionMeta,
    prompt: readFileSync(paths.prompt, 'utf-8'),
    transcript: readFileSync(paths.transcript, 'utf-8'),
    output: readFileSync(paths.output, 'utf-8'),
  };
}

export function ensureBrowserSessionRoot(repoRoot: string, customRoot?: string): string {
  const root = sessionRoot(repoRoot, customRoot);
  mkdirSync(root, { recursive: true });
  return root;
}

export function resolveConversationUrl(repoRoot: string, sessionId: string, customRoot?: string): string {
  const session = readBrowserSession(repoRoot, sessionId, customRoot);
  const url = session.meta.browser.conversationUrl;
  if (!url) throw new Error(`session has no ChatGPT conversation URL: ${sessionId}`);
  return url;
}

export function cleanupBrowserSessions(repoRoot: string, opts: {
  customRoot?: string;
  olderThanDays?: number;
  status?: BrowserSessionStatus;
  dryRun?: boolean;
  limit?: number;
} = {}): { removed: string[]; candidates: string[]; dryRun: boolean } {
  const root = sessionRoot(repoRoot, opts.customRoot);
  if (!existsSync(root)) return { removed: [], candidates: [], dryRun: opts.dryRun !== false };
  const cutoff = opts.olderThanDays === undefined ? undefined : Date.now() - opts.olderThanDays * 24 * 60 * 60 * 1000;
  const candidates = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const sessionDir = join(root, entry.name);
      const metaPath = join(sessionDir, 'meta.json');
      if (!existsSync(metaPath)) return null;
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as BrowserSessionMeta;
      const stat = statSync(sessionDir);
      if (opts.status && meta.status !== opts.status) return null;
      if (cutoff !== undefined && stat.mtimeMs >= cutoff) return null;
      return { sessionId: entry.name, sessionDir };
    })
    .filter((entry): entry is { sessionId: string; sessionDir: string } => entry !== null)
    .sort((a, b) => a.sessionId.localeCompare(b.sessionId))
    .slice(0, opts.limit ?? Number.POSITIVE_INFINITY);
  if (opts.dryRun !== false) return { removed: [], candidates: candidates.map((entry) => entry.sessionId), dryRun: true };
  for (const entry of candidates) rmSync(entry.sessionDir, { recursive: true, force: true });
  return { removed: candidates.map((entry) => entry.sessionId), candidates: candidates.map((entry) => entry.sessionId), dryRun: false };
}
