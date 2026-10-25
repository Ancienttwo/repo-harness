import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { cleanRoomEnvironment, CleanRoomDaemon, finishCleanRoom, type DaemonCommand } from '../scripts/lib/axr5-clean-room-runtime';

const envelope = (data: unknown) => ({ status: 0, stdout: JSON.stringify({ schemaVersion: 'archcontext.envelope/v1', ok: true, data }) });

describe('AXR5 isolated runtime lifecycle (no listener)', () => {
  test('overrides inherited state root and removes a host database override without mutating the parent', () => {
    const inherited = { HOME: '/host', ARCHCONTEXT_STATE_DIR: '/host/state', ARCHCONTEXT_LOCAL_STORE_PATH: '/host/data.sqlite', PATH: '/tools' };
    const env = cleanRoomEnvironment('/fixture', inherited);
    expect(env.HOME).toBe(join('/fixture', 'host-home'));
    expect(env.ARCHCONTEXT_STATE_DIR).toBe(join('/fixture', 'runtime-state'));
    expect(env.ARCHCONTEXT_LOCAL_STORE_PATH).toBeUndefined();
    expect(env.PATH).toBe('/tools');
    expect(inherited.ARCHCONTEXT_LOCAL_STORE_PATH).toBe('/host/data.sqlite');
    expect(inherited.ARCHCONTEXT_STATE_DIR).toBe('/host/state');
  });

  test('snapshot failure still stops the armed fixture with the original isolated environment', () => {
    const env = cleanRoomEnvironment('/fixture', { PATH: '/fake-bin' });
    const calls: string[] = [];
    const command: DaemonCommand = (binary, args, options) => {
      expect(binary).toBe('/package/archctx');
      expect(options.cwd).toBe('/fixture/repo');
      expect(options.env.HOME).toBe(join('/fixture', 'host-home'));
      expect(options.env.PATH).toBe('/fake-bin');
      expect(options.env.ARCHCONTEXT_STATE_DIR).toBe(join('/fixture', 'runtime-state'));
      expect(options.timeout).toBe(5000);
      calls.push(args.join(' '));
      return envelope(args[1] === 'stop' ? { stopping: true } : { running: false });
    };
    const daemon = new CleanRoomDaemon(command, () => {});
    daemon.arm('/package/archctx', '/fixture/repo', env);
    env.HOME = '/changed-after-arm';
    const failure = new Error('snapshot failed');
    let cleaned = false;
    expect(() => {
      try { throw failure; } finally {
        finishCleanRoom({ daemon, failure: { error: failure }, cleanup: () => { cleaned = true; } });
      }
    }).toThrow('snapshot failed');
    expect(calls).toEqual(['daemon stop', 'daemon status']);
    expect(cleaned).toBe(true);
  });

  test('waits for shutdown confirmation and never treats a live lock as stopped', () => {
    let statusCalls = 0;
    let pauses = 0;
    const daemon = new CleanRoomDaemon((_binary, args) => {
      if (args[1] === 'stop') return envelope({ stopping: true });
      statusCalls++;
      return envelope(statusCalls === 1 ? { running: false, lockOwnerPid: 123 } : { running: false });
    }, () => { pauses++; });
    daemon.arm('/package/archctx', '/fixture/repo', {});
    daemon.stop();
    expect(statusCalls).toBe(2);
    expect(pauses).toBe(1);
    daemon.stop();
    expect(statusCalls).toBe(2);
  });

  test.each([
    { status: 1, stdout: '' },
    { status: null, stdout: '', error: new Error('timeout') },
    { status: 0, stdout: 'not JSON' },
    { status: 0, stdout: JSON.stringify({ schemaVersion: 'archcontext.envelope/v1', ok: false }) },
  ])('retains workspace when stop fails: %j', result => {
    const daemon = new CleanRoomDaemon(() => result, () => {});
    daemon.arm('/package/archctx', '/fixture/repo', {});
    let cleaned = false;
    expect(() => finishCleanRoom({ daemon, cleanup: () => { cleaned = true; } })).toThrow('preserve workspace');
    expect(cleaned).toBe(false);
  });

  test('retains both operation and cleanup errors without deleting diagnostic state', () => {
    const original = new Error('snapshot failed');
    let cleaned = false;
    try {
      finishCleanRoom({ daemon: { stop: () => { throw new Error('stop failed'); } }, failure: { error: original }, cleanup: () => { cleaned = true; } });
      throw new Error('expected cleanup error');
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors[0]).toBe(original);
      expect((error as AggregateError).errors[1].message).toBe('stop failed');
    }
    expect(cleaned).toBe(false);
  });

  test('waits through a stale connection and live lock before removing state', () => {
    const statuses = [
      { running: false, staleConnection: true },
      { running: false, lockOwnerPid: 123 },
      { running: false },
    ];
    let reads = 0;
    let cleaned = false;
    const daemon = new CleanRoomDaemon((_binary, args) => envelope(args[1] === 'stop' ? { stopping: true } : statuses[reads++]), () => {});
    daemon.arm('/package/archctx', '/fixture/repo', {});
    finishCleanRoom({ daemon, cleanup: () => { cleaned = true; } });
    expect(reads).toBe(3);
    expect(cleaned).toBe(true);
  });

  test('persistent stale connection keeps the workspace', () => {
    let cleaned = false;
    const daemon = new CleanRoomDaemon((_binary, args) => envelope(args[1] === 'stop' ? { stopping: true } : { running: false, staleConnection: true }), () => {});
    daemon.arm('/package/archctx', '/fixture/repo', {});
    expect(() => finishCleanRoom({ daemon, cleanup: () => { cleaned = true; } })).toThrow('stop was not confirmed');
    expect(cleaned).toBe(false);
  });

  test('retains the original failure when filesystem cleanup throws', () => {
    const original = new Error('projection failed');
    const cleanupFailure = new Error('EBUSY');
    let caught: unknown;
    try {
      finishCleanRoom({ daemon: { stop: () => {} }, failure: { error: original }, cleanup: () => { throw cleanupFailure; } });
    } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors).toEqual([original, cleanupFailure]);
  });

  test('malformed status cannot authorize workspace removal', () => {
    const daemon = new CleanRoomDaemon((_binary, args) => args[1] === 'stop' ? envelope({ stopping: true }) : { status: 0, stdout: '{}' }, () => {});
    daemon.arm('/package/archctx', '/fixture/repo', {});
    let cleaned = false;
    expect(() => finishCleanRoom({ daemon, cleanup: () => { cleaned = true; } })).toThrow('did not confirm success');
    expect(cleaned).toBe(false);
  });

  test('does not remove workspace after a successful stop response while daemon remains running', () => {
    const daemon = new CleanRoomDaemon((_binary, args) => envelope(args[1] === 'stop' ? { stopping: true } : { running: true }), () => {});
    daemon.arm('/package/archctx', '/fixture/repo', {});
    let cleaned = false;
    expect(() => finishCleanRoom({ daemon, cleanup: () => { cleaned = true; } })).toThrow('stop was not confirmed');
    expect(cleaned).toBe(false);
  });
});
