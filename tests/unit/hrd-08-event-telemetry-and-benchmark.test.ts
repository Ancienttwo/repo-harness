import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  createHookEventTelemetry,
  HOOK_EVENT_TELEMETRY_PATH,
  isHookEventTelemetryRecord,
} from '../../src/cli/hook/event-telemetry';

const scratch: string[] = [];

afterEach(() => {
  for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(path);
  return path;
}

describe('HRD-08 event telemetry authority', () => {
  test('writes one complete event record and finalization is idempotent', () => {
    const repoRoot = tempDir('hrd08-event-telemetry-');
    const telemetry = createHookEventTelemetry({
      repoRoot,
      event: 'PostToolUse',
      routeId: 'edit',
      input: JSON.stringify({ session_id: 'session-1', run_id: 'run-1', turn_id: 'turn-1' }),
      env: { HOOK_HOST: 'codex' },
    });

    telemetry.recordStateResolution();
    telemetry.recordDirectChildProcess();
    telemetry.recordFilesRead(['tasks/contracts/example.contract.md']);
    telemetry.recordEventWrite('.ai/harness/journal/post-edit/pending/example.json');
    telemetry.recordWriteTransaction();
    telemetry.recordStep({
      name: 'mutation-observed',
      execution: 'in_process',
      startedAt: new Date('2026-07-21T08:00:00.000Z'),
      elapsedMs: 12.345,
      exitCode: 0,
      outputBytes: 0,
    });
    telemetry.markMetricsComplete([
      'state_resolutions',
      'files_read',
      'files_written',
      'durable_writes',
      'write_transactions',
      'full_projection_writes',
      'event_writes',
    ]);

    const first = telemetry.finalize({ exitCode: 0, reason: 'ok' });
    const second = telemetry.finalize({ exitCode: 1, reason: 'script-failed' });
    const lines = readFileSync(join(repoRoot, HOOK_EVENT_TELEMETRY_PATH), 'utf8').trim().split('\n');

    expect(second).toEqual(first);
    expect(lines).toHaveLength(1);
    const record: unknown = JSON.parse(lines[0]);
    expect(isHookEventTelemetryRecord(record)).toBe(true);
    if (!isHookEventTelemetryRecord(record)) throw new Error('record failed validation');
    expect(record.protocol).toBe('loop-engine-hook-event/v1');
    expect(record.runtime_entries).toBe(1);
    expect(record.host).toBe('codex');
    expect(record.session_id).toBe('session-1');
    expect(record.metrics).toMatchObject({
      state_resolutions: 1,
      child_processes: 1,
      files_read: 1,
      files_written: 1,
      durable_writes: 1,
      write_transactions: 1,
      full_projection_writes: 0,
      event_writes: 1,
    });
    expect(record.measurement.complete).toBe(true);
    expect(record.measurement.incomplete_metrics).toEqual([]);
    expect(record.steps).toHaveLength(1);
  });

  test('opaque steps are explicit and do not fabricate hidden I/O completeness', () => {
    const repoRoot = tempDir('hrd08-event-opaque-');
    const telemetry = createHookEventTelemetry({
      repoRoot,
      event: 'UserPromptSubmit',
      routeId: 'default',
    });
    telemetry.recordDirectChildProcess();
    telemetry.markOpaqueStep('prompt-guard.sh');
    telemetry.recordStep({
      name: 'prompt-guard.sh',
      execution: 'subprocess',
      startedAt: new Date(),
      elapsedMs: 2,
      exitCode: 0,
      outputBytes: null,
    });

    const record = telemetry.finalize({ exitCode: 0, reason: 'ok' });
    expect(record.measurement.complete).toBe(false);
    expect(record.measurement.opaque_steps).toEqual(['prompt-guard.sh']);
    expect(record.measurement.complete_metrics).toEqual([
      'runtime_entries',
      'child_processes',
      'elapsed_ms',
    ]);
    expect(record.metrics.files_read).toBe(0);
    expect(record.measurement.incomplete_metrics).toContain('files_read');
  });

  test('semantic fingerprints detect repeated equivalent blocked events', () => {
    const repoRoot = tempDir('hrd08-event-fingerprint-');
    const run = () => {
      const telemetry = createHookEventTelemetry({
        repoRoot,
        event: 'PreToolUse',
        routeId: 'edit',
      });
      telemetry.recordStateResolution();
      telemetry.markMetricsComplete(['state_resolutions']);
      telemetry.recordStep({
        name: 'mutation-guard',
        execution: 'in_process',
        startedAt: new Date(),
        elapsedMs: Math.random() * 100,
        exitCode: 2,
        outputBytes: 42,
        blocked: true,
      });
      return telemetry.finalize({ exitCode: 2, reason: 'script-failed', blocked: true });
    };

    const first = run();
    const second = run();
    expect(first.event_id).not.toBe(second.event_id);
    expect(first.fingerprint).toBe(second.fingerprint);
  });

  test('telemetry write failure never changes the hook result record', () => {
    const parent = tempDir('hrd08-event-fail-open-');
    const notDirectory = join(parent, 'not-a-directory');
    writeFileSync(notDirectory, 'occupied', 'utf8');
    const telemetry = createHookEventTelemetry({
      repoRoot: notDirectory,
      event: 'Stop',
      routeId: 'default',
    });

    expect(() => telemetry.finalize({ exitCode: 0, reason: 'ok' })).not.toThrow();
    expect(telemetry.finalize({ exitCode: 0, reason: 'ok' }).result_reason).toBe('ok');
  });

  test('strict validator rejects the retired per-script protocol', () => {
    expect(isHookEventTelemetryRecord({ protocol: 1, script: 'prompt-guard.sh' })).toBe(false);
  });
});
