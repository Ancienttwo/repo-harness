import { createHash } from 'crypto';
import { existsSync, readFileSync, statSync } from 'fs';
import { isAbsolute, resolve } from 'path';
import { resolveMcpPath } from '../mcp/paths';
import type { McpPolicy } from '../mcp/types';
import type { BrowserWriteOutputPolicy, PromptBundleFile } from './types';

const READ_ALLOW_GLOBS = [
  'AGENTS.md',
  'CLAUDE.md',
  'README.md',
  'README.*.md',
  'package.json',
  'docs/**',
  'plans/**',
  'tasks/**',
  '.ai/context/**',
  '.ai/harness/**',
];

const READ_DENY_GLOBS = [
  '.env',
  '.env.*',
  '*.pem',
  '*.key',
  '*.p12',
  '*.pfx',
  '.ssh/**',
  '.git/**',
  'node_modules/**',
  'dist/**',
  'build/**',
  'coverage/**',
  'secrets/**',
  'credentials/**',
  'private/**',
  '_ops/**',
  '.repo-harness/**/*.json',
  '.ai/harness/chatgpt/bridge-extension/**',
];

const WRITE_DENY_GLOBS = [
  ...READ_DENY_GLOBS,
  'src/**',
  'app/**',
  'packages/**',
  'package.json',
  'bun.lock',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  '.github/workflows/**',
];

const BROWSER_READ_POLICY: McpPolicy = {
  profile: 'planner',
  readGlobs: READ_ALLOW_GLOBS,
  writeGlobs: [],
  denyGlobs: READ_DENY_GLOBS,
  maxFileBytes: 512 * 1024,
  execution: { fixedWorkflowCheck: false, codexRunner: false },
};

const BROWSER_CLI_OUTPUT_POLICY: McpPolicy = {
  profile: 'planner',
  readGlobs: [],
  writeGlobs: ['**'],
  denyGlobs: WRITE_DENY_GLOBS,
  maxFileBytes: 0,
  execution: { fixedWorkflowCheck: false, codexRunner: false },
};

const BROWSER_MCP_OUTPUT_POLICY: McpPolicy = {
  profile: 'planner',
  readGlobs: [],
  writeGlobs: [
    '.ai/harness/handoff/*.md',
    'tasks/reviews/**',
    '.ai/harness/checks/**',
    'plans/prds/**',
    'plans/sprints/**',
  ],
  denyGlobs: WRITE_DENY_GLOBS,
  maxFileBytes: 0,
  execution: { fixedWorkflowCheck: false, codexRunner: false },
};

function isProbablyBinary(bytes: Buffer): boolean {
  return bytes.subarray(0, Math.min(bytes.length, 8000)).includes(0);
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function browserReason(reason?: string): string {
  return (reason ?? 'path denied').replace('MCP policy', 'ChatGPT browser policy');
}

export function resolveBrowserInputPath(repoRoot: string, inputPath: string): { ok: true; path: string; absolutePath: string } | { ok: false; reason: string; path?: string } {
  const decision = resolveMcpPath(repoRoot, inputPath, BROWSER_READ_POLICY, 'read');
  if (!decision.ok || !decision.relativePath || !decision.absolutePath) {
    return { ok: false, path: decision.relativePath, reason: browserReason(decision.reason) };
  }
  return { ok: true, path: decision.relativePath, absolutePath: decision.absolutePath };
}

export function resolveBrowserOutputPath(repoRoot: string, inputPath: string, opts: {
  policy?: BrowserWriteOutputPolicy;
  allowAbsolute?: boolean;
  overwrite?: boolean;
} = {}): { ok: true; path: string; absolutePath: string } | { ok: false; reason: string; path?: string } {
  const rawPath = inputPath.trim();
  if (!rawPath) return { ok: false, reason: 'write output path is required' };

  if (isAbsolute(rawPath)) {
    if (opts.policy === 'mcp') return { ok: false, path: rawPath, reason: 'absolute write output paths are not allowed for MCP browser consults' };
    if (opts.allowAbsolute !== true) {
      return { ok: false, path: rawPath, reason: 'absolute write output paths require --allow-absolute-output' };
    }
    const absolutePath = resolve(rawPath);
    if (existsSync(absolutePath) && opts.overwrite !== true) {
      return { ok: false, path: rawPath, reason: `write output already exists: ${rawPath}` };
    }
    return { ok: true, path: rawPath, absolutePath };
  }

  const policy = opts.policy === 'mcp' ? BROWSER_MCP_OUTPUT_POLICY : BROWSER_CLI_OUTPUT_POLICY;
  const decision = resolveMcpPath(repoRoot, rawPath, policy, 'write');
  if (!decision.ok || !decision.relativePath || !decision.absolutePath) {
    return { ok: false, path: decision.relativePath, reason: browserReason(decision.reason) };
  }
  if (existsSync(decision.absolutePath) && opts.overwrite !== true) {
    return { ok: false, path: decision.relativePath, reason: `write output already exists: ${decision.relativePath}` };
  }
  return { ok: true, path: decision.relativePath, absolutePath: decision.absolutePath };
}

export function readBrowserInputFile(repoRoot: string, inputPath: string, maxInlineChars: number): PromptBundleFile {
  const decision = resolveBrowserInputPath(repoRoot, inputPath);
  if (!decision.ok) throw new Error(decision.reason);
  const fileStat = statSync(decision.absolutePath);
  if (!fileStat.isFile()) throw new Error(`path is not a file: ${decision.path}`);
  const bytes = readFileSync(decision.absolutePath);
  if (isProbablyBinary(bytes)) throw new Error(`binary files are not supported by inline browser consult: ${decision.path}`);
  const content = bytes.toString('utf-8');
  if (content.length > maxInlineChars) {
    throw new Error(`file exceeds --max-inline-chars (${maxInlineChars}): ${decision.path}`);
  }
  return {
    path: decision.path,
    delivery: 'inline',
    size: fileStat.size,
    sha256: sha256(bytes),
    chars: content.length,
    content,
  };
}
