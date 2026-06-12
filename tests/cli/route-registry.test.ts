import { describe, expect, test } from 'bun:test';
import { existsSync } from 'fs';
import { join } from 'path';
import {
  ROUTES,
  allEvents,
  getRoute,
  listRoutesForEvent,
} from '../../src/cli/hook/route-registry';

describe('route registry (Phase 1B Z design)', () => {
  test('ROUTES is frozen and has exactly 8 routes', () => {
    expect(Object.isFrozen(ROUTES)).toBe(true);
    expect(ROUTES.length).toBe(8);
  });

  test('PostToolUse has 3 matcher-disjoint routes (Edit|Write / Bash / undefined)', () => {
    const postRoutes = listRoutesForEvent('PostToolUse');
    expect(postRoutes.length).toBe(3);
    expect(postRoutes.map((r) => r.matcher)).toEqual(['Edit|Write', 'Bash', undefined]);
  });

  test('PreToolUse has edit and subagent routes with matcher isolation', () => {
    const preRoutes = listRoutesForEvent('PreToolUse');
    expect(preRoutes.length).toBe(2);
    expect(preRoutes[0].matcher).toBe('Edit|Write');
    expect(preRoutes[0].routeId).toBe('edit');
    expect(preRoutes[1].matcher).toBe('Task|Agent|SendUserMessage');
    expect(preRoutes[1].routeId).toBe('subagent');
  });

  test('getRoute returns the expected ordered scripts for each route', () => {
    expect(getRoute('SessionStart', 'default')?.scripts).toEqual(['session-start-context.sh', 'security-sentinel.sh']);
    expect(getRoute('PreToolUse', 'edit')?.scripts).toEqual(['worktree-guard.sh', 'pre-edit-guard.sh']);
    expect(getRoute('PreToolUse', 'subagent')?.scripts).toEqual(['subagent-return-channel-guard.sh']);
    expect(getRoute('PostToolUse', 'edit')?.scripts).toEqual(['post-edit-guard.sh']);
    expect(getRoute('PostToolUse', 'bash')?.scripts).toEqual(['post-bash.sh']);
    expect(getRoute('PostToolUse', 'always')?.scripts).toEqual(['post-tool-observer.sh']);
    expect(getRoute('UserPromptSubmit', 'default')?.scripts).toEqual(['prompt-guard.sh']);
    expect(getRoute('Stop', 'default')?.scripts).toEqual(['stop-orchestrator.sh']);
  });

  test('getRoute returns undefined for unknown (event, route) tuples', () => {
    expect(getRoute('Stop', 'edit')).toBeUndefined();
    expect(getRoute('SessionStart', 'bash')).toBeUndefined();
    expect(getRoute('PreToolUse', 'always')).toBeUndefined();
    expect(getRoute('PostToolUse', 'subagent')).toBeUndefined();
  });

  test('allEvents returns the 5 supported events in canonical order', () => {
    expect(allEvents()).toEqual([
      'SessionStart',
      'PreToolUse',
      'PostToolUse',
      'UserPromptSubmit',
      'Stop',
    ]);
  });

  test('every route script name is in the known hook set (catches typos)', () => {
    const KNOWN = new Set([
      'session-start-context.sh',
      'security-sentinel.sh',
      'worktree-guard.sh',
      'pre-edit-guard.sh',
      'subagent-return-channel-guard.sh',
      'post-edit-guard.sh',
      'post-bash.sh',
      'post-tool-observer.sh',
      'prompt-guard.sh',
      'stop-orchestrator.sh',
    ]);
    for (const r of ROUTES) {
      for (const s of r.scripts) expect(KNOWN.has(s)).toBe(true);
    }
  });

  test('every public route script is installable from assets/hooks', () => {
    for (const route of ROUTES) {
      for (const script of route.scripts) {
        expect(existsSync(join(import.meta.dir, '../..', 'assets/hooks', script))).toBe(true);
      }
    }
  });

  test('each Route is frozen so registry cannot drift at runtime', () => {
    for (const r of ROUTES) {
      expect(Object.isFrozen(r)).toBe(true);
      expect(Object.isFrozen(r.scripts)).toBe(true);
    }
  });
});
