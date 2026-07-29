import { createHash } from 'crypto';
import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { isAbsolute, join, resolve } from 'path';
import type { BrowserConsultInput, PromptBundle, PromptSecretScanReceipt } from './types';

const GITLEAKS_ENV = 'REPO_HARNESS_GITLEAKS_BIN';
const MIN_GITLEAKS_VERSION = [8, 19, 0] as const;

export interface GitleaksResolution {
  binary?: string;
  source: '--gitleaks-bin' | 'REPO_HARNESS_GITLEAKS_BIN' | 'PATH' | 'missing';
  error?: string;
}

function resolveConfiguredBinary(value: string, repoRoot: string): string | undefined {
  const hasPathSeparator = value.includes('/') || value.includes('\\');
  if (!hasPathSeparator) return Bun.which(value) ?? undefined;
  const candidate = isAbsolute(value) ? value : resolve(repoRoot, value);
  return existsSync(candidate) ? candidate : undefined;
}

export function resolveGitleaksBin(input: Pick<BrowserConsultInput, 'repoRoot' | 'gitleaksBin'>): GitleaksResolution {
  if (input.gitleaksBin) {
    const binary = resolveConfiguredBinary(input.gitleaksBin, input.repoRoot);
    return binary
      ? { binary, source: '--gitleaks-bin' }
      : { source: '--gitleaks-bin', error: `gitleaks binary was not found at --gitleaks-bin ${input.gitleaksBin}` };
  }
  const configured = process.env[GITLEAKS_ENV]?.trim();
  if (configured) {
    const binary = resolveConfiguredBinary(configured, input.repoRoot);
    return binary
      ? { binary, source: GITLEAKS_ENV }
      : { source: GITLEAKS_ENV, error: `gitleaks binary was not found at ${GITLEAKS_ENV}=${configured}` };
  }
  const binary = Bun.which('gitleaks');
  return binary
    ? { binary, source: 'PATH' }
    : { source: 'missing', error: 'gitleaks CLI was not found via --gitleaks-bin, REPO_HARNESS_GITLEAKS_BIN, or PATH' };
}

function parseVersion(text: string): { label: string; parts: readonly [number, number, number] } | undefined {
  const match = text.match(/\bv?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?\b/);
  if (!match) return undefined;
  return {
    label: match[0]!.replace(/^v/, ''),
    parts: [Number(match[1]), Number(match[2]), Number(match[3])],
  };
}

function versionAtLeast(actual: readonly number[], minimum: readonly number[]): boolean {
  for (let index = 0; index < minimum.length; index += 1) {
    const left = actual[index] ?? 0;
    const right = minimum[index] ?? 0;
    if (left !== right) return left > right;
  }
  return true;
}

function scannerEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.GITLEAKS_CONFIG;
  delete env.GITLEAKS_CONFIG_TOML;
  return env;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf-8').digest('hex');
}

export function scanPromptBundle(
  input: Pick<BrowserConsultInput, 'repoRoot' | 'gitleaksBin'>,
  bundle: PromptBundle,
): PromptSecretScanReceipt {
  const resolution = resolveGitleaksBin(input);
  if (!resolution.binary) {
    throw new Error(`PROMPT_SECRET_SCAN_UNAVAILABLE: ${resolution.error}; install Gitleaks >= 8.19 or select a trusted binary explicitly`);
  }
  if (resolution.source === 'missing') {
    throw new Error('PROMPT_SECRET_SCAN_UNAVAILABLE: resolved Gitleaks source is missing');
  }

  const probe = spawnSync(resolution.binary, ['version'], {
    encoding: 'utf-8',
    timeout: 15_000,
    maxBuffer: 1024 * 1024,
    env: scannerEnv(),
  });
  const parsedVersion = parseVersion(`${probe.stdout ?? ''}\n${probe.stderr ?? ''}`);
  if (probe.error || probe.status !== 0 || !parsedVersion || !versionAtLeast(parsedVersion.parts, MIN_GITLEAKS_VERSION)) {
    throw new Error('PROMPT_SECRET_SCAN_UNAVAILABLE: resolved Gitleaks is incompatible; version >= 8.19 with the stdin command is required');
  }

  const payloads = [
    { kind: 'prompt' as const, index: 0, content: bundle.rendered },
    ...bundle.followups.map((content, index) => ({ kind: 'followup' as const, index: index + 1, content })),
  ];
  const scanRoot = mkdtempSync(join(tmpdir(), 'repo-harness-gitleaks-'));
  try {
    for (const payload of payloads) {
      const scan = spawnSync(resolution.binary, [
        '--no-banner',
        '--no-color',
        '--redact=100',
        '--log-level',
        'error',
        '--ignore-gitleaks-allow',
        'stdin',
      ], {
        cwd: scanRoot,
        env: scannerEnv(),
        input: payload.content,
        encoding: 'utf-8',
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      });
      if (scan.error || scan.status !== 0) {
        throw new Error(`PROMPT_SECRET_SCAN_FAILED: Gitleaks rejected delegate ${payload.kind} ${payload.index}; no session or provider was started`);
      }
    }
  } finally {
    rmSync(scanRoot, { recursive: true, force: true });
  }

  return {
    scanner: 'gitleaks',
    version: parsedVersion.label,
    source: resolution.source,
    status: 'passed',
    payloads: payloads.map((payload) => ({
      kind: payload.kind,
      index: payload.index,
      bytes: Buffer.byteLength(payload.content, 'utf-8'),
      sha256: sha256(payload.content),
    })),
  };
}
