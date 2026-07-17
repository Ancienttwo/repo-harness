import { spawnSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { PROCESS_SUPERVISOR_TERMINATION_GRACE_MS } from "./process-supervisor";

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
  readonly processGroup?: boolean;
  readonly expensiveRunLock?: {
    readonly cwd: string;
    readonly gitBin: string;
  };
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
const PROCESS_SUPERVISOR = join(import.meta.dir, "process-supervisor.ts");
const PROCESS_SUPERVISOR_HARD_TIMEOUT_SLACK_MS = 1_000;

interface SupervisedProcessReceipt {
  readonly status: number;
  readonly signal: NodeJS.Signals | null;
  readonly timedOut: boolean;
  readonly interruptedBy: NodeJS.Signals | null;
  readonly parentLost: boolean;
  readonly spawnError: string;
  readonly completed: boolean;
  readonly processGroupPid: number | null;
}

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

function processGroupExists(pid: number): boolean {
  try {
    process.kill(process.platform === "win32" ? pid : -pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

function signalProcessGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(pid), "/T", ...(signal === "SIGKILL" ? ["/F"] : [])], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      process.kill(-pid, signal);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

function waitSynchronously(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function terminateAbandonedProcessGroup(pid: number): string {
  try {
    signalProcessGroup(pid, "SIGTERM");
    waitSynchronously(PROCESS_SUPERVISOR_TERMINATION_GRACE_MS);
    signalProcessGroup(pid, "SIGKILL");
    const deadline = Date.now() + PROCESS_SUPERVISOR_TERMINATION_GRACE_MS;
    while (processGroupExists(pid) && Date.now() < deadline) waitSynchronously(10);
    return processGroupExists(pid)
      ? `supervisor backstop could not prove process group ${pid} exited`
      : "";
  } catch (error) {
    return `supervisor backstop failed for process group ${pid}: ${errorMessage(error)}`;
  }
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

function runSupervisedProcess(
  command: string,
  args: readonly string[],
  opts: RunProcessOptions,
  timeoutMs: number,
  maxOutputBytes: number,
): { receipt: SupervisedProcessReceipt; stdout: string; stderr: string } {
  const runtimeDir = mkdtempSync(join(tmpdir(), "repo-harness-process-"));
  const receiptPath = join(runtimeDir, "receipt.json");
  const stdio = opts.stdio ?? "pipe";
  const environment = opts.inheritEnv === false ? opts.env : { ...process.env, ...(opts.env ?? {}) };
  try {
    const supervisorArgs = [
      PROCESS_SUPERVISOR,
      "--metadata", receiptPath,
      "--parent-pid", String(process.pid),
      "--timeout-ms", String(timeoutMs),
      "--capture-bytes", String(maxOutputBytes + 1),
      "--stdio", stdio,
    ];
    if (opts.expensiveRunLock) {
      supervisorArgs.push(
        "--expensive-lock-cwd", opts.expensiveRunLock.cwd,
        "--git-bin", opts.expensiveRunLock.gitBin,
      );
    }
    supervisorArgs.push("--", command, ...args);
    const supervisorHardTimeoutMs = timeoutMs
      + PROCESS_SUPERVISOR_TERMINATION_GRACE_MS
      + PROCESS_SUPERVISOR_HARD_TIMEOUT_SLACK_MS;
    const result = spawnSync(process.execPath, supervisorArgs, {
      cwd: opts.cwd,
      encoding: stdio === "pipe" ? "utf8" : undefined,
      env: environment,
      stdio,
      timeout: supervisorHardTimeoutMs,
      killSignal: "SIGKILL",
      maxBuffer: Math.max(maxOutputBytes + 1, DEFAULT_PROCESS_MAX_BUFFER_BYTES),
    });
    let receipt: SupervisedProcessReceipt;
    try {
      receipt = JSON.parse(readFileSync(receiptPath, "utf8")) as SupervisedProcessReceipt;
    } catch (error) {
      const detail = errorMessage(error);
      const supervisorError = result.error ? errorMessage(result.error) : "";
      receipt = {
        status: result.status ?? 1,
        signal: result.signal,
        timedOut: false,
        interruptedBy: null,
        parentLost: false,
        spawnError: ["process supervisor did not publish a receipt", supervisorError, detail].filter(Boolean).join(": "),
        completed: false,
        processGroupPid: null,
      };
    }
    const supervisorError = result.error as NodeJS.ErrnoException | undefined;
    const supervisorTimedOut = supervisorError?.code === "ETIMEDOUT";
    const processGroupPid = Number.isSafeInteger(receipt.processGroupPid) && receipt.processGroupPid! > 0
      ? receipt.processGroupPid
      : null;
    const envelopeMismatch = supervisorError !== undefined
      || result.signal !== null
      || result.status === null
      || result.status !== receipt.status
      || receipt.completed !== true
      || (receipt.processGroupPid !== null && processGroupPid === null);
    if (envelopeMismatch) {
      const cleanupError = processGroupPid === null ? "" : terminateAbandonedProcessGroup(processGroupPid);
      const envelopeError = supervisorTimedOut
        ? `process supervisor exceeded hard timeout after ${supervisorHardTimeoutMs}ms`
        : [
          "process supervisor exited inconsistently with its receipt",
          result.signal ? `signal=${result.signal}` : "",
          supervisorError ? errorMessage(supervisorError) : "",
        ].filter(Boolean).join(": ");
      receipt = {
        ...receipt,
        status: 1,
        signal: result.signal ?? receipt.signal,
        timedOut: receipt.timedOut || supervisorTimedOut,
        spawnError: [receipt.spawnError, envelopeError, cleanupError].filter(Boolean).join(": "),
      };
    }
    return {
      receipt,
      stdout: typeof result.stdout === "string" ? result.stdout : "",
      stderr: typeof result.stderr === "string" ? result.stderr : "",
    };
  } finally {
    rmSync(runtimeDir, { recursive: true, force: true });
  }
}

export function runProcess(command: string, args: readonly string[], opts: RunProcessOptions = {}): ProcessRunResult {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_PROCESS_TIMEOUT_MS;
  const maxOutputBytes = opts.maxOutputBytes ?? DEFAULT_PROCESS_MAX_OUTPUT_BYTES;
  const redactions = opts.redactions ?? DEFAULT_REDACTIONS;
  const redactedCommand = [command, ...args].map((part) => redactProcessOutput(part, redactions));
  const supervised = opts.processGroup
    ? runSupervisedProcess(command, args, opts, timeoutMs, maxOutputBytes)
    : null;
  const result = supervised === null
    ? spawnSync(command, [...args], {
      cwd: opts.cwd,
      encoding: opts.stdio === "inherit" || opts.stdio === "ignore" ? undefined : "utf8",
      env: opts.inheritEnv === false ? opts.env : { ...process.env, ...(opts.env ?? {}) },
      stdio: opts.stdio ?? "pipe",
      timeout: timeoutMs,
      maxBuffer: Math.max(maxOutputBytes, DEFAULT_PROCESS_MAX_BUFFER_BYTES),
    })
    : null;
  const error = result?.error as NodeJS.ErrnoException | undefined;
  const timedOut = supervised?.receipt.timedOut ?? error?.code === "ETIMEDOUT";
  const status = supervised?.receipt.status ?? result?.status ?? 1;
  const signal = supervised?.receipt.signal ?? result?.signal ?? null;
  const stdout = supervised?.stdout ?? (typeof result?.stdout === "string" ? result.stdout : "");
  const stderr = supervised?.stderr ?? (typeof result?.stderr === "string" ? result.stderr : "");
  const rawError = supervised?.receipt.spawnError ?? (error ? errorMessage(error) : "");
  const timeoutMessage = timedOut ? `process timed out after ${timeoutMs}ms: ${redactedCommand.join(" ")}` : "";
  const failureMessage = [timeoutMessage, rawError].filter(Boolean).join("\n");
  const stderrDetails = [timeoutMessage, rawError]
    .filter((detail) => detail && !stderr.includes(detail))
    .join("\n");
  const stderrOrError = [stderr, stderrDetails].filter(Boolean).join("\n");

  return {
    ok: status === 0 && !rawError && !timedOut,
    status,
    signal,
    timedOut,
    command: redactedCommand,
    stdout: capProcessOutput(redactProcessOutput(stdout, redactions), maxOutputBytes),
    stderr: capProcessOutput(redactProcessOutput(stderrOrError, redactions), maxOutputBytes),
    error: redactProcessOutput(failureMessage, redactions),
  };
}
