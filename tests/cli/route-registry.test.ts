import { describe, expect, test } from 'bun:test';
import { existsSync } from 'fs';
import { join } from 'path';
import {
  ROUTES,
  allEvents,
  getRoute,
  listRoutesForEvent,
  routeSupportsHost,
  routesForHost,
} from '../../src/cli/hook/route-registry';

describe('route registry (Phase 1B Z design)', () => {
  test('ROUTES is frozen and has exactly 11 routes', () => {
    expect(Object.isFrozen(ROUTES)).toBe(true);
    expect(ROUTES.length).toBe(11);
  });

  test('host-scoped route views keep Codex at 11 and Claude at 8 shared routes', () => {
    expect(routesForHost('codex').length).toBe(11);
    expect(routesForHost('claude').length).toBe(8);
    expect(routesForHost('claude').map((r) => `${r.event}.${r.routeId}`)).toEqual([
      'SessionStart.default',
      'PreToolUse.edit',
      'PreToolUse.subagent',
      'PostToolUse.edit',
      'PostToolUse.bash',
      'PostToolUse.always',
      'UserPromptSubmit.default',
      'Stop.default',
    ]);
    expect(routeSupportsHost(getRoute('UserPromptSubmit', 'delegation')!, 'codex')).toBe(true);
    expect(routeSupportsHost(getRoute('UserPromptSubmit', 'delegation')!, 'claude')).toBe(false);
    expect(routeSupportsHost(getRoute('SubagentStart', 'context')!, 'claude')).toBe(false);
    expect(routeSupportsHost(getRoute('SubagentStop', 'quality')!, 'claude')).toBe(false);
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
    // HRD-04: SessionStart.default's script list is retired scripts-free --
    // the in-process session-context builder (src/cli/hook/session-context.ts)
    // assembles this route's context unconditionally now; see
    // route-registry.ts's own comment on this route for why the list is
    // empty rather than a symbolic placeholder.
    expect(getRoute('SessionStart', 'default')?.scripts).toEqual([]);
    // HRD-03: PreToolUse.edit's script list is retired scripts-free -- the
    // in-process mutation-guard handler (src/cli/hook/mutation-guard.ts) now
    // decides this route unconditionally; see route-registry.ts's own
    // comment on this route for why the list is empty rather than a
    // symbolic placeholder.
    expect(getRoute('PreToolUse', 'edit')?.scripts).toEqual([]);
    expect(getRoute('PreToolUse', 'subagent')?.scripts).toEqual(['subagent-return-channel-guard.sh']);
    // HRD-05: PostToolUse.edit's script list is retired scripts-free -- the
    // in-process mutation-observed journal handler
    // (src/cli/hook/mutation-observed.ts) now decides this route
    // unconditionally; see route-registry.ts's own comment on this route for
    // why the list is empty rather than a symbolic placeholder.
    expect(getRoute('PostToolUse', 'edit')?.scripts).toEqual([]);
    expect(getRoute('PostToolUse', 'bash')?.scripts).toEqual(['post-bash.sh']);
    expect(getRoute('PostToolUse', 'always')?.scripts).toEqual(['post-tool-observer.sh']);
    expect(getRoute('UserPromptSubmit', 'default')?.scripts).toEqual(['prompt-guard.sh']);
    expect(getRoute('UserPromptSubmit', 'delegation')?.scripts).toEqual(['codex-delegation-advisor.sh']);
    expect(getRoute('SubagentStart', 'context')?.scripts).toEqual(['subagent-start-context.sh']);
    expect(getRoute('SubagentStop', 'quality')?.scripts).toEqual(['subagent-stop-quality.sh']);
    expect(getRoute('Stop', 'default')?.scripts).toEqual(['stop-orchestrator.sh']);
  });

  test('getRoute returns undefined for unknown (event, route) tuples', () => {
    expect(getRoute('Stop', 'edit')).toBeUndefined();
    expect(getRoute('SessionStart', 'bash')).toBeUndefined();
    expect(getRoute('PreToolUse', 'always')).toBeUndefined();
    expect(getRoute('PostToolUse', 'subagent')).toBeUndefined();
    expect(getRoute('SubagentStart', 'default')).toBeUndefined();
    expect(getRoute('SubagentStop', 'default')).toBeUndefined();
  });

  test('allEvents returns the 7 supported events in canonical order', () => {
    expect(allEvents()).toEqual([
      'SessionStart',
      'PreToolUse',
      'PostToolUse',
      'UserPromptSubmit',
      'SubagentStart',
      'SubagentStop',
      'Stop',
    ]);
  });

  test('every route script name is in the known hook set (catches typos)', () => {
    const KNOWN = new Set([
      'session-start-context.sh',
      'minimal-change-context.sh',
      'security-sentinel.sh',
      'worktree-guard.sh',
      'pre-edit-guard.sh',
      'subagent-return-channel-guard.sh',
      'post-edit-guard.sh',
      'minimal-change-observer.sh',
      'post-bash.sh',
      'post-tool-observer.sh',
      'prompt-guard.sh',
      'codex-delegation-advisor.sh',
      'subagent-start-context.sh',
      'subagent-stop-quality.sh',
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
      if (r.hosts) expect(Object.isFrozen(r.hosts)).toBe(true);
    }
  });
});
