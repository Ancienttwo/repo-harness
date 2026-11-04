import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import {
  CLAUDE_QUOTA_CAPTURE_PATH,
  decodeClaudeQuotaCapture,
  decodeCodexRateLimitsResult,
  unknownQuotaReading,
  type QuotaReading,
} from '../../core/operator/quota';

const CODEX_READ_TIMEOUT_MS = 20_000;

/** Reads only the capture file that the Q2 status line route writes. */
export function readClaudeQuota(env: NodeJS.ProcessEnv = process.env): QuotaReading {
  const path = join(env.HOME ?? homedir(), ...CLAUDE_QUOTA_CAPTURE_PATH);
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return unknownQuotaReading('claude', code === 'ENOENT' ? 'no capture' : `capture unreadable (${code})`);
  }
  let value: unknown;
  try { value = JSON.parse(text); } catch { return unknownQuotaReading('claude', 'capture is not JSON'); }
  return decodeClaudeQuotaCapture(value);
}

/**
 * One active read through `codex app-server`: `initialize`, then
 * `account/rateLimits/read`. It starts no thread and no model turn, and reads
 * no Codex rollout log. Every failure is an `unknown` reading with its reason.
 */
export function readCodexQuota(env: NodeJS.ProcessEnv, clientVersion: string, timeoutMs = CODEX_READ_TIMEOUT_MS): Promise<QuotaReading> {
  return new Promise(resolve => {
    const child = spawn('codex', ['app-server'], { env, stdio: ['pipe', 'pipe', 'ignore'] });
    let settled = false;
    const finish = (reading: QuotaReading) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      lines.close();
      child.stdin.destroy();
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      resolve(reading);
    };
    const fail = (reason: string) => finish(unknownQuotaReading('chatgpt', reason));
    const send = (message: object) => child.stdin.write(`${JSON.stringify(message)}\n`);
    const timer = setTimeout(() => fail(`codex app-server did not answer in ${timeoutMs / 1000} s`), timeoutMs);
    child.once('error', error => fail((error as NodeJS.ErrnoException).code === 'ENOENT' ? 'codex not on PATH' : `codex app-server did not start (${(error as NodeJS.ErrnoException).code})`));
    // `close` follows the last stdout line, so a response written just before exit still counts.
    child.once('close', (code, signal) => fail(`codex app-server exited (${signal ?? code}) before the response`));
    // A broken pipe shows as the exit above; the reason names the exit, not the write.
    child.stdin.on('error', () => {});
    const lines = createInterface({ input: child.stdout });
    lines.on('line', line => {
      let message: Record<string, unknown>;
      try { message = JSON.parse(line); } catch { fail('codex app-server wrote a line that is not JSON'); return; }
      // Notifications and server requests carry a method. This read answers neither.
      if (!message || typeof message !== 'object' || 'method' in message) return;
      const error = message.error as { message?: unknown } | undefined;
      if (message.id === 0) {
        if (error) { fail(`initialize error: ${String(error.message)}`); return; }
        send({ method: 'initialized' });
        send({ method: 'account/rateLimits/read', id: 1 });
      } else if (message.id === 1) {
        if (error) fail(`account/rateLimits/read error: ${String(error.message)}`);
        else finish(decodeCodexRateLimitsResult(message.result, new Date().toISOString()));
      }
    });
    send({ method: 'initialize', id: 0, params: { clientInfo: { name: 'repo-harness', version: clientVersion } } });
  });
}
