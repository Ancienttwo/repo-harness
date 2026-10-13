import { afterEach, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { acquireExclusiveDirectoryLock, ExclusiveLockContentionError } from '../../src/effects/locking/exclusive-directory-lock';
import { observePmLockContention } from '../helpers/pm-lock-contention-observer';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function root() { const path = realpathSync(mkdtempSync(join(tmpdir(), 'pm-lock-observer-'))); roots.push(path); return path; }

test('eight pre-lock verifier entries satisfy the old criterion without proving contention', () => {
  const dir = root(), held = acquireExclusiveDirectoryLock(dir, 'caller.lock');
  let observed = false;
  const acquire = observePmLockContention(acquireExclusiveDirectoryLock, held.lockPath, () => { observed = true; });
  try {
    // The real PM source calls these guards before repository/path preparation.
    // No lock acquisition has happened in this controlled pre-lock stage.
    const verifierEntries = Array.from({ length: 8 }, () => 'verified');
    const oldReady = verifierEntries.length >= 8;
    expect(oldReady).toBe(true);
    expect(observed).toBe(false);
    held.assertOwned();
    expect(() => acquire(dir, 'caller.lock', { waitTimeoutMs: 1 })).toThrow(ExclusiveLockContentionError);
    expect(observed).toBe(true);
    held.assertOwned();
  } finally { held.release(); }
  const acquired = acquire(dir, 'caller.lock');
  acquired.assertOwned(); acquired.release();
});

test('only the exact target contention signals; original error is rethrown', () => {
  const dir = root(), target = acquireExclusiveDirectoryLock(dir, 'caller.lock'), other = acquireExclusiveDirectoryLock(dir, 'other.lock');
  let events = 0;
  const acquire = observePmLockContention(acquireExclusiveDirectoryLock, target.lockPath, () => { events++; });
  try {
    expect(() => acquire(dir, 'other.lock', { waitTimeoutMs: 1 })).toThrow(ExclusiveLockContentionError);
    expect(events).toBe(0);
    let original: unknown;
    const failing = (...args: Parameters<typeof acquireExclusiveDirectoryLock>) => {
      try { return acquireExclusiveDirectoryLock(...args); } catch (error) { original = error; throw error; }
    };
    const observed = observePmLockContention(failing, target.lockPath, () => { events++; });
    let caught: unknown;
    try { observed(dir, 'caller.lock', { waitTimeoutMs: 1 }); } catch (error) { caught = error; }
    expect(caught).toBe(original);
    expect(events).toBe(1);
    target.assertOwned(); other.assertOwned();
  } finally { target.release(); other.release(); }
});

test('successful acquisition retains its real handle without a wait signal', () => {
  const dir = root(); let events = 0;
  const acquire = observePmLockContention(acquireExclusiveDirectoryLock, join(dir, 'caller.lock'), () => { events++; });
  const handle = acquire(dir, 'caller.lock');
  try { handle.assertOwned(); expect(handle.lockPath).toBe(join(dir, 'caller.lock')); expect(events).toBe(0); }
  finally { handle.release(); }
});

test('the isolated child observes the real async lock retry before its action runs', () => {
  const locksPath = fileURLToPath(new URL('../../src/effects/locking/exclusive-directory-lock.ts', import.meta.url));
  const observerPath = fileURLToPath(new URL('../helpers/pm-lock-contention-observer.ts', import.meta.url));
  const code = `import {mock} from 'bun:test';
import {mkdtempSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
const locks=await import(${JSON.stringify(locksPath)});const acquire=locks.acquireExclusiveDirectoryLock;
const {observePmLockContention}=await import(${JSON.stringify(observerPath)});
const root=realpathSync(mkdtempSync(join(tmpdir(),'pm-lock-child-')));let events=0,ran=false;
const held=acquire(root,'caller.lock');
mock.module(${JSON.stringify(locksPath)},()=>({...locks,acquireExclusiveDirectoryLock:observePmLockContention(acquire,held.lockPath,()=>{events++;})}));
try{
 const patched=await import(${JSON.stringify(locksPath)});
 const pending=patched.withExclusiveDirectoryLockAsync(root,'caller.lock',async()=>{ran=true;return 'real-result';});
 const before={contended:events>0,ran};held.assertOwned();held.release();
 const result=await pending;console.log(JSON.stringify({before,result,ran}));
}finally{held.release();rmSync(root,{recursive:true,force:true});}`;
  const child = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', timeout: 10000 });
  expect(child.status, child.stderr).toBe(0);
  expect(JSON.parse(child.stdout)).toEqual({ before: { contended: true, ran: false }, result: 'real-result', ran: true });
});

test('an observation callback failure cannot replace the original contention error', () => {
  const dir = root(), held = acquireExclusiveDirectoryLock(dir, 'caller.lock');
  let original: unknown;
  const acquire = (...args: Parameters<typeof acquireExclusiveDirectoryLock>) => {
    try { return acquireExclusiveDirectoryLock(...args); } catch (error) { original = error; throw error; }
  };
  const observed = observePmLockContention(acquire, held.lockPath, () => { throw new Error('fixture observer failed'); });
  try {
    let caught: unknown;
    try { observed(dir, 'caller.lock', { waitTimeoutMs: 1 }); } catch (error) { caught = error; }
    expect(caught).toBe(original);
    expect(caught).toBeInstanceOf(ExclusiveLockContentionError);
    held.assertOwned();
  } finally { held.release(); }
});
