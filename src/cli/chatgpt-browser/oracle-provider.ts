import { spawnSync } from 'child_process';
import { existsSync, statSync } from 'fs';
import { basename, resolve } from 'path';
import type { BrowserConsultInput, BrowserImportedArtifact, PromptBundle } from './types';

export interface OracleProviderResult {
  status: 'completed' | 'failed';
  output: string;
  conversationUrl?: string;
  providerSessionId?: string;
  artifacts?: BrowserImportedArtifact[];
  error?: {
    code: string;
    message: string;
    recovery?: string;
  };
  command: string[];
}

export function buildOracleCommand(input: BrowserConsultInput): string[] {
  const args = ['--engine', 'browser', '--browser-manual-login', '--prompt', input.prompt];
  if (input.sourceSessionId) args.push('--session', input.sourceSessionId);
  if (input.model) args.push('--model', input.model);
  if (input.thinking) args.push('--browser-thinking-time', input.thinking);
  for (const file of input.files ?? []) args.push('--file', file.path);
  for (const followup of input.followups ?? []) args.push('--browser-follow-up', followup);
  if (input.writeOutput) args.push('--write-output', input.writeOutput);
  return args;
}

function extractConversationUrl(output: string): string | undefined {
  return output.match(/https:\/\/chatgpt\.com\/c\/[^\s)]+/)?.[0];
}

function extractProviderSessionId(output: string): string | undefined {
  return output.match(/\b(?:oracle[_ -]?session|session(?: id)?)[:=]\s*([A-Za-z0-9_.:-]+)/i)?.[1];
}

function extractArtifactPaths(output: string, cwd: string): BrowserImportedArtifact[] {
  const artifacts: BrowserImportedArtifact[] = [];
  const seen = new Set<string>();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/\b(?:artifact|artifacts|output|transcript|session file)[:=]\s*(.+)$/i);
    if (!match) continue;
    const candidate = match[1].trim().replace(/^file:\/\//, '').replace(/^["']|["']$/g, '');
    if (!candidate) continue;
    const sourcePath = candidate.startsWith('/') ? candidate : resolve(cwd, candidate);
    if (seen.has(sourcePath) || !existsSync(sourcePath)) continue;
    const fileStat = statSync(sourcePath);
    if (!fileStat.isFile()) continue;
    seen.add(sourcePath);
    artifacts.push({ sourcePath, fileName: basename(sourcePath), size: fileStat.size });
  }
  return artifacts;
}

export function runOracleProvider(input: BrowserConsultInput, _bundle: PromptBundle): OracleProviderResult {
  const oraclePath = Bun.which('oracle');
  const args = buildOracleCommand(input);
  const command = ['oracle', ...args];
  if (!oraclePath) {
    return {
      status: 'failed',
      output: 'Oracle CLI is not installed or not visible on PATH.',
      command,
      error: {
        code: 'ORACLE_NOT_FOUND',
        message: 'oracle CLI is not installed or not visible on PATH',
        recovery: 'Install oracle or rerun with --dry-run.',
      },
    };
  }
  const result = spawnSync(oraclePath, args, {
    cwd: input.repoRoot,
    encoding: 'utf-8',
    timeout: input.timeoutMs ?? 1_800_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const stdout = result.stdout?.trimEnd() ?? '';
  const stderr = result.stderr?.trimEnd() ?? '';
  const output = [stdout, stderr ? `\n[stderr]\n${stderr}` : ''].filter(Boolean).join('\n').trimEnd();
  if (result.error) {
    return {
      status: 'failed',
      output: output || result.error.message,
      command,
      error: {
        code: 'ORACLE_EXEC_FAILED',
        message: result.error.message,
      },
    };
  }
  if (result.status !== 0) {
    return {
      status: 'failed',
      output: output || `oracle exited with status ${result.status}`,
      command,
      error: {
        code: 'ORACLE_EXIT_NONZERO',
        message: `oracle exited with status ${result.status}`,
      },
    };
  }
  return {
    status: 'completed',
    output,
    conversationUrl: extractConversationUrl(output),
    providerSessionId: extractProviderSessionId(output),
    artifacts: extractArtifactPaths(output, input.repoRoot),
    command,
  };
}
