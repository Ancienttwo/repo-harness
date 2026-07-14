import { spawnSync } from "child_process";

export interface ProcessOutputRedaction {
  readonly pattern: RegExp;
  readonly replacement: string;
}

export interface RunProcessOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly inheritEnv?: boolean;
  readonly stdio?: "pipe" | "inherit" | "ignore";
  readonly timeoutMs?: number;
  readonly maxOutputBytes?: number;
  readonly redactions?: readonly ProcessOutputRedaction[];
}

export interface ProcessRunResult {
  readonly ok: boolean;
  readonly status: number;
  readonly signal: NodeJS.Signals | null;
  readonly timedOut: boolean;
  readonly command: readonly string[];
  readonly stdout: string;
  readonly stderr: string;
  readonly error: string;
}

export const DEFAULT_PROCESS_TIMEOUT_MS = 120_000;
export const DEFAULT_PROCESS_MAX_OUTPUT_BYTES = 64 * 1024;
export const DEFAULT_PROCESS_MAX_BUFFER_BYTES = 1024 * 1024;

const DEFAULT_REDACTIONS: readonly ProcessOutputRedaction[] = [
  {
    pattern: /(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi,
    replacement: "$1[redacted]",
  },
  {
    pattern: /((?:api[_-]?key|token|secret|password|authorization)\s*[:=]\s*)(?:"[^"\s]+"|'[^'\s]+'|[^\s]+)/gi,
    replacement: "$1[redacted]",
  },
];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "");
}

export function redactProcessOutput(
  value: string,
  redactions: readonly ProcessOutputRedaction[] = DEFAULT_REDACTIONS,
): string {
  return redactions.reduce((current, redaction) => current.replace(redaction.pattern, redaction.replacement), value);
}

export function capProcessOutput(value: string, maxBytes = DEFAULT_PROCESS_MAX_OUTPUT_BYTES): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  const clipped = Buffer.from(value, "utf8").subarray(0, maxBytes).toString("utf8").replace(/\uFFFD$/, "");
  return `${clipped}\n[output truncated after ${maxBytes} bytes]`;
}

export function runProcess(command: string, args: readonly string[], opts: RunProcessOptions = {}): ProcessRunResult {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_PROCESS_TIMEOUT_MS;
  const maxOutputBytes = opts.maxOutputBytes ?? DEFAULT_PROCESS_MAX_OUTPUT_BYTES;
  const redactions = opts.redactions ?? DEFAULT_REDACTIONS;
  const redactedCommand = [command, ...args].map((part) => redactProcessOutput(part, redactions));
  const result = spawnSync(command, [...args], {
    cwd: opts.cwd,
    encoding: opts.stdio === "inherit" || opts.stdio === "ignore" ? undefined : "utf8",
    env: opts.inheritEnv === false ? opts.env : { ...process.env, ...(opts.env ?? {}) },
    stdio: opts.stdio ?? "pipe",
    timeout: timeoutMs,
    maxBuffer: Math.max(maxOutputBytes, DEFAULT_PROCESS_MAX_BUFFER_BYTES),
  });
  const error = result.error as NodeJS.ErrnoException | undefined;
  const timedOut = error?.code === "ETIMEDOUT";
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  const rawError = error ? errorMessage(error) : "";
  const timeoutMessage = timedOut ? `process timed out after ${timeoutMs}ms: ${redactedCommand.join(" ")}` : "";
  const stderrOrError = [stderr, timeoutMessage || (!stderr && rawError ? rawError : "")].filter(Boolean).join("\n");

  return {
    ok: result.status === 0 && !result.error,
    status: result.status ?? 1,
    signal: result.signal,
    timedOut,
    command: redactedCommand,
    stdout: capProcessOutput(redactProcessOutput(stdout, redactions), maxOutputBytes),
    stderr: capProcessOutput(redactProcessOutput(stderrOrError, redactions), maxOutputBytes),
    error: redactProcessOutput(timeoutMessage || rawError, redactions),
  };
}
