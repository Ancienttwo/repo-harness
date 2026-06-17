import { createHash } from 'crypto';
import { readFileSync, statSync } from 'fs';
import { normalizeMcpRelativePath, globMatches } from '../mcp/paths';
import type { PromptBundleFile } from './types';

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
  '.ai/harness/chatgpt/tmp/**',
];

function denyGlobMatches(pattern: string, relativePath: string): boolean {
  if (globMatches(pattern, relativePath)) return true;
  if (!pattern.includes('/')) return relativePath.split('/').some((segment) => globMatches(pattern, segment));
  return globMatches(`**/${pattern}`, relativePath);
}

function isProbablyBinary(bytes: Buffer): boolean {
  return bytes.subarray(0, Math.min(bytes.length, 8000)).includes(0);
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function resolveBrowserInputPath(inputPath: string): { ok: true; path: string } | { ok: false; reason: string; path?: string } {
  const normalized = normalizeMcpRelativePath(inputPath);
  if (!normalized.ok || !normalized.relativePath) return { ok: false, reason: normalized.reason ?? 'invalid path' };
  const path = normalized.relativePath;
  if (READ_DENY_GLOBS.some((pattern) => denyGlobMatches(pattern, path))) {
    return { ok: false, path, reason: `path is denied by ChatGPT browser policy: ${path}` };
  }
  if (!READ_ALLOW_GLOBS.some((pattern) => globMatches(pattern, path))) {
    return { ok: false, path, reason: `path is not allowed for ChatGPT browser consult: ${path}` };
  }
  return { ok: true, path };
}

export function readBrowserInputFile(repoRoot: string, inputPath: string, maxInlineChars: number): PromptBundleFile {
  const decision = resolveBrowserInputPath(inputPath);
  if (!decision.ok) throw new Error(decision.reason);
  const absolutePath = `${repoRoot}/${decision.path}`;
  const fileStat = statSync(absolutePath);
  if (!fileStat.isFile()) throw new Error(`path is not a file: ${decision.path}`);
  const bytes = readFileSync(absolutePath);
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
