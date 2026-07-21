import { describe, expect, test } from 'bun:test';
import {
  ROUTES,
  allEvents,
  getRoute,
  listRoutesForEvent,
  routeSupportsHost,
  routesForHost,
} from '../../src/cli/hook/route-registry';
import { getHandlerForRoute, handlerIdForRoute, listHandlerBindings } from '../../src/cli/hook/handler-registry';

describe('typed hook route registry', () => {
  test('routes are frozen, ordered, and carry no legacy script field', () => {
    expect(Object.isFrozen(ROUTES)).toBe(true);
    expect(ROUTES).toHaveLength(11);
    for (const route of ROUTES) {
      expect(Object.isFrozen(route)).toBe(true);
      expect('scripts' in route).toBe(false);
      expect(typeof route.handler).toBe('string');
    }
  });

  test('host-scoped route views preserve the public adapter contract', () => {
    expect(routesForHost('codex')).toHaveLength(11);
    expect(routesForHost('claude').map((route) => `${route.event}.${route.routeId}`)).toEqual([
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
  });

  test('matcher partitions remain disjoint', () => {
    expect(listRoutesForEvent('PostToolUse').map((route) => route.matcher)).toEqual(['Edit|Write', 'Bash', undefined]);
    expect(listRoutesForEvent('PreToolUse').map((route) => route.matcher)).toEqual(['Edit|Write', 'Task|Agent|SendUserMessage']);
  });

  test('every route has exactly one exhaustive typed handler binding', () => {
    const bindings = listHandlerBindings();
    expect(Object.keys(bindings)).toHaveLength(11);
    for (const route of ROUTES) {
      const key = `${route.event}.${route.routeId}`;
      expect(handlerIdForRoute(route.event, route.routeId)).toBe(route.handler);
      expect(getHandlerForRoute(route)?.id).toBe(route.handler);
      expect(bindings[key]).toBe(route.handler);
    }
  });

  test('events and unknown tuples stay stable', () => {
    expect(allEvents()).toEqual([
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
