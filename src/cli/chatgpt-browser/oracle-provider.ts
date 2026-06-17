import { spawnSync } from 'child_process';
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
  if (input.providerSessionId) args.push('--session', input.providerSessionId);
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

function extractArtifactPaths(_output: string): BrowserImportedArtifact[] {
  return [];
}

export function runOracleProvider(input: BrowserConsultInput, _bundle: PromptBundle): OracleProviderResult {
  const oraclePath = Bun.which('oracle');
  const args = buildOracleCommand(input);
  const command = ['oracle', ...args];
  if (input.sourceSessionId && !input.providerSessionId) {
    return {
      status: 'failed',
      output: `Oracle follow-up requires providerSessionId for source session ${input.sourceSessionId}.`,
      command,
      error: {
        code: 'ORACLE_PROVIDER_SESSION_MISSING',
        message: 'Oracle follow-up requires the upstream provider session id',
        recovery: 'Start from a session whose meta.json contains providerSessionId, or run a new browser consult.',
      },
    };
  }
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
    artifacts: extractArtifactPaths(output),
    command,
  };
}
