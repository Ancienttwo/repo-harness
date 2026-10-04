import { afterEach, describe, expect, test } from 'bun:test';
import { closeSync, existsSync, lstatSync, ftruncateSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { createHookEventTelemetry, HOOK_EVENT_TELEMETRY_PATH } from '../../src/cli/hook/event-telemetry';
import { readHookEventTelemetry } from '../../src/cli/hook/event-telemetry';
import { readHookMetrics } from '../../scripts/run-harness-profile-benchmark';
import { appendHookEventLog, HOOK_LOG_ARCHIVE_BYTES, readHookEventLog } from '../../src/effects/hook-event-log';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() { const root = mkdtempSync(join(tmpdir(), 'hook-log-')); roots.push(root); return root; }
function emit(root: string) { return createHookEventTelemetry({ repoRoot: root, event: 'PostToolUse', routeId: 'always' }).finalize({ exitCode: 0, reason: 'ok' }); }
function seedFull(root: string) {
  const first = emit(root);
  writeFileSync(join(root, HOOK_EVENT_TELEMETRY_PATH), `${' \n'.repeat(4 * 1024 * 1024)}${JSON.stringify(first)}\n`);
  return first;
}

describe('bounded hook event history', () => {
  test('streamed history preserves UTF-8 across chunk boundaries and a final line', () => {
    const root = fixture(); const path = join(root, HOOK_EVENT_TELEMETRY_PATH);
    const line = `${'a'.repeat(65535)}中文`;
    appendHookEventLog(path, `${line}\r\nlast`, root);
    expect([...readHookEventLog(path, root)!]).toEqual([line, 'last']);
  });
  test('prunes only oldest owned segments by count and keeps foreign files', () => {
    const root = fixture(); seedFull(root);
    const directory = `${join(root, HOOK_EVENT_TELEMETRY_PATH)}.archive`;
    mkdirSync(directory);
    const names = Array.from({ length: 33 }, (_, i) => `${1700000000000 + i}-${randomUUID()}.jsonl`);
    for (const name of names) writeFileSync(join(directory, name), '\n');
    writeFileSync(join(directory, 'operator-notes.jsonl'), 'keep');
    emit(root);
    expect(existsSync(join(directory, names[0]!))).toBe(false);
    expect(existsSync(join(directory, names[1]!))).toBe(false);
    expect(existsSync(join(directory, names[2]!))).toBe(true);
    expect(readdirSync(directory)).toHaveLength(33);
    expect(readFileSync(join(directory, 'operator-notes.jsonl'), 'utf8')).toBe('keep');
  });

  test('the archive byte budget also bounds large legacy segments', () => {
    const root = fixture(); seedFull(root);
    const directory = `${join(root, HOOK_EVENT_TELEMETRY_PATH)}.archive`;
    mkdirSync(directory);
    const old = join(directory, `1700000000000-${randomUUID()}.jsonl`);
    const fd = openSync(old, 'w');
    ftruncateSync(fd, HOOK_LOG_ARCHIVE_BYTES);
    closeSync(fd);
    emit(root);
    expect(existsSync(old)).toBe(false);
    expect(readdirSync(directory)).toHaveLength(1);
    expect(readHookMetrics(root)).toHaveLength(2);
  });

  test('an opened historical snapshot survives later pruning', () => {
    const root = fixture(); const first = seedFull(root); const second = emit(root);
    const path = join(root, HOOK_EVENT_TELEMETRY_PATH);
    const snapshot = readHookEventLog(path, root)!;
    const directory = `${path}.archive`;
    for (const name of readdirSync(directory)) rmSync(join(directory, name));
    expect([...snapshot].map(line => JSON.parse(line).event_id)).toEqual([first.event_id, second.event_id]);
  });

  test('unsafe archive and active symlinks cannot mutate external data', () => {
    const root = fixture(); seedFull(root);
    const outside = fixture(); const path = join(root, HOOK_EVENT_TELEMETRY_PATH);
    symlinkSync(outside, `${path}.archive`);
    expect(() => emit(root)).not.toThrow();
    expect(readdirSync(outside)).toHaveLength(0);
    expect(() => readHookMetrics(root)).toThrow('unsafe hook telemetry archive');
    rmSync(`${path}.archive`); rmSync(path);
    writeFileSync(join(outside, 'private'), 'keep'); symlinkSync(join(outside, 'private'), path);
    emit(root);
    expect(readFileSync(join(outside, 'private'), 'utf8')).toBe('keep');
  });

  test('a repository ancestor redirected outside cannot read, rotate, or append', () => {
    const root = fixture(); const outside = fixture();
    mkdirSync(join(root, '.ai'));
    symlinkSync(outside, join(root, '.ai/harness'));
    mkdirSync(join(outside, 'runs'));
    const external = join(outside, 'runs/hook-events.jsonl');
    writeFileSync(external, 'private');
    const path = join(root, HOOK_EVENT_TELEMETRY_PATH);
    expect(() => appendHookEventLog(path, 'new\n', root)).toThrow('escapes repository');
    expect(() => readHookEventLog(path, root)).toThrow('escapes repository');
    expect(readFileSync(external, 'utf8')).toBe('private');
    expect(readdirSync(join(outside, 'runs'))).toEqual(['hook-events.jsonl']);
  });

  test('in-repository log symlinks cannot append, rotate, or prune their targets', () => {
    for (const size of [4, 9 * 1024 * 1024, HOOK_LOG_ARCHIVE_BYTES + 1]) {
      const root = fixture(); const path = join(root, HOOK_EVENT_TELEMETRY_PATH);
      emit(root); rmSync(path);
      const target = join(root, 'user-data');
      const fd = openSync(target, 'w'); ftruncateSync(fd, size); closeSync(fd);
      const before = statSync(target);
      symlinkSync(target, path);
      expect(() => appendHookEventLog(path, 'new\n', root)).toThrow();
      expect(() => readHookEventLog(path, root)).toThrow();
      expect(() => emit(root)).not.toThrow();
      expect(lstatSync(path).isSymbolicLink()).toBe(true);
      const after = statSync(target);
      expect([after.dev, after.ino, after.size, after.mtimeMs]).toEqual([before.dev, before.ino, before.size, before.mtimeMs]);
      expect(existsSync(`${target}.archive`)).toBe(false);
      expect(existsSync(`${path}.archive`)).toBe(false);
    }
  });

  test('oversized records are rejected without creating an unbounded active file', () => {
    const root = fixture();
    expect(() => appendHookEventLog(join(root, HOOK_EVENT_TELEMETRY_PATH), 'x'.repeat(8 * 1024 * 1024 + 1), root)).toThrow('segment budget');
    expect(existsSync(join(root, HOOK_EVENT_TELEMETRY_PATH))).toBe(false);
  });

  test('concurrent processes preserve every event across rotation', async () => {
    const root = fixture(); const first = seedFull(root);
    const module = join(import.meta.dir, '../../src/cli/hook/event-telemetry.ts');
    const children = Array.from({ length: 6 }, () => Bun.spawn([process.execPath, '-e', `import { createHookEventTelemetry } from ${JSON.stringify(module)}; for (let i=0;i<30;i++) createHookEventTelemetry({repoRoot:${JSON.stringify(root)},event:'PostToolUse',routeId:'always'}).finalize({exitCode:0,reason:'ok'});`], { stdout: 'pipe', stderr: 'pipe' }));
    expect(await Promise.all(children.map(child => child.exited))).toEqual(Array(6).fill(0));
    const records = readHookMetrics(root);
    expect(records).toHaveLength(181);
    expect(new Set(records.map(r => r.event_id)).size).toBe(181);
    expect(records[0]!.event_id).toBe(first.event_id);
    expect(readHookEventTelemetry(root).invalidRecordCount).toBe(0);
  });
  test('rotation preserves old records in both report consumers', () => {
    const root = fixture();
    const first = seedFull(root);
    const second = emit(root);
    expect(statSync(join(root, HOOK_EVENT_TELEMETRY_PATH)).size).toBeLessThan(8 * 1024 * 1024);
    expect(readHookMetrics(root).map(r => r.event_id)).toEqual([first.event_id, second.event_id]);
    const report = readHookEventTelemetry(root);
    expect(report.records.map(r => r.event_id)).toEqual([first.event_id, second.event_id]);
    expect(report.invalidRecordCount).toBe(0);
    expect(report.duplicateEventIdCount).toBe(0);
  });

  test('reader preserves malformed, invalid, mixed and duplicate diagnostics', () => {
    const root = fixture();
    const record = emit(root);
    const variants = [
      { ...record, protocol: 'old/v1' },
      { ...record, started_at: 'invalid' },
      { ...record, route_id: 'missing-route' },
      { ...record, measurement: { ...record.measurement, opaque_steps: [1] } },
      { ...record, steps: [{ name: 'bad', execution: 'in_process', started_at: record.started_at, elapsed_ms: -1, exit_code: 0, output_bytes: null }] },
    ];
    writeFileSync(join(root, 'invalid.jsonl'), ['{', ...[record, record, ...variants].map(value => JSON.stringify(value))].join('\n'));
    const report = readHookEventTelemetry(root, 'invalid.jsonl');
    expect(report.records.map(value => value.event_id)).toEqual([record.event_id, record.event_id]);
    expect(report.sampleCount).toBe(8);
    expect(report.invalidRecordCount).toBe(6);
    expect(report.malformedRecordCount).toBe(1);
    expect(report.mixedProtocol).toBe(true);
    expect(report.duplicateEventIdCount).toBe(1);
    expect(report.missing).toBe(false);
    expect(readHookEventTelemetry(root, 'absent.jsonl')).toEqual({
      records: [], sampleCount: 0, invalidRecordCount: 0, malformedRecordCount: 0,
      mixedProtocol: false, duplicateEventIdCount: 0, missing: true,
    });
  });

  test('an explicit custom report file does not include the default history', () => {
    const root = fixture();
    seedFull(root);
    const second = emit(root);
    writeFileSync(join(root, 'custom.jsonl'), `${JSON.stringify(second)}\n`);
    expect(readHookEventTelemetry(root, 'custom.jsonl').records).toHaveLength(1);
  });
});
