import { describe, expect, test } from 'bun:test';
import {
  ROUTES,
  getRoute,
  routeSupportsHost,
  routesForHost,
  type HookEvent,
} from '../../src/cli/hook/route-registry';
import { getHandlerForRoute } from '../../src/cli/hook/handler-registry';

function matchers(event: HookEvent): (string | undefined)[] {
  return ROUTES.filter((route) => route.event === event).map((route) => route.matcher);
}

describe('typed hook route registry', () => {
  test('routes are frozen, ordered, and carry no legacy script field', () => {
    expect(Object.isFrozen(ROUTES)).toBe(true);
    expect(ROUTES).toHaveLength(12);
    for (const route of ROUTES) {
      expect(Object.isFrozen(route)).toBe(true);
      expect('scripts' in route).toBe(false);
      expect(typeof route.handler).toBe('string');
    }
  });

  test('host-scoped route views preserve the public adapter contract', () => {
    expect(routesForHost('codex')).toHaveLength(12);
    expect(routesForHost('claude').map((route) => `${route.event}.${route.routeId}`)).toEqual([
      'SessionStart.default',
      'PreToolUse.edit',
      'PreToolUse.subagent',
      'PostToolUse.edit',
      'PostToolUse.bash',
      'PostToolUse.always',
      'UserPromptSubmit.default',
      'UserPromptSubmit.inbox',
      'Stop.default',
    ]);
    expect(routeSupportsHost(getRoute('UserPromptSubmit', 'delegation')!, 'codex')).toBe(true);
    expect(routeSupportsHost(getRoute('UserPromptSubmit', 'delegation')!, 'claude')).toBe(false);
  });

  test('matcher partitions remain disjoint', () => {
    expect(matchers('PostToolUse')).toEqual(['Edit|Write', 'Bash', undefined]);
    expect(matchers('PreToolUse')).toEqual(['Edit|Write', 'Task|Agent|SendUserMessage']);
  });

  test('every route has exactly one exhaustive typed handler binding', () => {
    expect(new Set(ROUTES.map((route) => `${route.event}.${route.routeId}`)).size).toBe(12);
    for (const route of ROUTES) expect(getHandlerForRoute(route).id).toBe(route.handler);
  });

  test('only the edit guard fails closed', () => {
    expect(ROUTES.filter((route) => route.failClosed).map((route) => `${route.event}.${route.routeId}`))
      .toEqual(['PreToolUse.edit']);
  });

  test('events and unknown tuples stay stable', () => {
    expect([...new Set(ROUTES.map((route) => route.event))]).toEqual([
      'SessionStart',
      'PreToolUse',
      'PostToolUse',
      'UserPromptSubmit',
      'SubagentStart',
      'SubagentStop',
      'Stop',
    ]);
    expect(getRoute('Stop', 'edit')).toBeUndefined();
    expect(getRoute('SessionStart', 'bash')).toBeUndefined();
    expect(getRoute('SubagentStop', 'default')).toBeUndefined();
  });
});
