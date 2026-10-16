import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  createHookEventTelemetry,
  HOOK_EVENT_TELEMETRY_PATH,
  HOOK_EVENT_TELEMETRY_PROTOCOL,
} from '../../src/cli/hook/event-telemetry';
import type { HookIdentity } from '../../src/cli/hook/hook-input';
import { readHookMetrics } from '../../scripts/run-harness-profile-benchmark';

const scratch: string[] = [];

afterEach(() => {
  for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(path);
  return path;
}

function identity(overrides: Partial<HookIdentity> = {}): HookIdentity {
  return { host: 'claude', sessionId: null, runId: null, turnId: null, ...overrides };
}

describe('HRD-08 event telemetry authority', () => {
  test('writes one v2 record that carries the resolved identity', () => {
    const repoRoot = tempDir('hrd08-event-telemetry-');
    const record = createHookEventTelemetry({ repoRoot, event: 'PostToolUse', routeId: 'edit' }).finalize({
      identity: identity({ host: 'codex', sessionId: 'session-1', runId: 'run-1', turnId: 'turn-1' }),
      exitCode: 0,
      blocked: false,
      reason: 'ok',
    });
    const lines = readFileSync(join(repoRoot, HOOK_EVENT_TELEMETRY_PATH), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual(record);
    expect(Object.keys(record).sort()).toEqual([
      'blocked', 'completed_at', 'elapsed_ms', 'event', 'event_id', 'exit_code', 'fingerprint',
      'host', 'protocol', 'reason', 'route_id', 'run_id', 'session_id', 'started_at', 'turn_id',
    ]);
    expect(record).toMatchObject({
      protocol: HOOK_EVENT_TELEMETRY_PROTOCOL,
      host: 'codex',
      session_id: 'session-1',
      run_id: 'run-1',
      turn_id: 'turn-1',
      event: 'PostToolUse',
      route_id: 'edit',
      exit_code: 0,
      blocked: false,
      reason: 'ok',
    });
    expect(record.elapsed_ms).toBeGreaterThanOrEqual(0);
  });

  test('semantic fingerprints detect repeated equivalent blocked events', () => {
    const repoRoot = tempDir('hrd08-event-fingerprint-');
    const run = (reason: string) => createHookEventTelemetry({ repoRoot, event: 'PreToolUse', routeId: 'edit' }).finalize({
      identity: identity(),
      exitCode: 2,
      blocked: true,
      reason,
    });

    const first = run('blocked');
    const second = run('blocked');
    expect(first.event_id).not.toBe(second.event_id);
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(run('handler-failed').fingerprint).not.toBe(first.fingerprint);
  });

  test('telemetry write failure never changes the hook result record', () => {
    const parent = tempDir('hrd08-event-fail-open-');
    const notDirectory = join(parent, 'not-a-directory');
    writeFileSync(notDirectory, 'occupied', 'utf8');
    const telemetry = createHookEventTelemetry({ repoRoot: notDirectory, event: 'Stop', routeId: 'default' });
    const result = { identity: identity(), exitCode: 0, blocked: false, reason: 'ok' };

    expect(() => telemetry.finalize(result)).not.toThrow();
    expect(telemetry.finalize(result).reason).toBe('ok');
  });

  test('the benchmark reader rejects the retired per-script protocol', () => {
    const repoRoot = tempDir('hrd08-retired-protocol-');
    mkdirSync(join(repoRoot, '.ai/harness/runs'), { recursive: true });
    writeFileSync(join(repoRoot, HOOK_EVENT_TELEMETRY_PATH), `${JSON.stringify({ protocol: 1, script: 'prompt-guard.sh' })}\n`);
    expect(() => readHookMetrics(repoRoot)).toThrow('invalid or mixed hook event telemetry protocol');
  });
});
