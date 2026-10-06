import { describe, expect, test } from 'bun:test';

import {
  OPERATOR_COLLABORATION_PROTOCOL,
  OPERATOR_COLLABORATION_SNAPSHOT_KIND,
  type OperatorCollaborationSnapshotV4,
} from '../../src/core/operator/collaboration-snapshot';
import {
  OperatorCollaborationError,
  assertOperatorCollaborationSnapshotIdentity,
} from '../../src/effects/operator/collaboration';
import {
  OPERATOR_API_PATH_PREFIX,
  OPERATOR_ARCHITECTURE_MODULES_ROUTE,
  OPERATOR_ARCHITECTURE_MODULE_ROUTE,
  OPERATOR_ARCHITECTURE_REVIEW_PROMPT_ROUTE,
  OPERATOR_COLLABORATION_SNAPSHOT_ROUTE,
  OPERATOR_FLEET_SNAPSHOT_PATH,
  OPERATOR_REPOSITORY_SNAPSHOT_ROUTE,
  OPERATOR_HEALTH_PATH,
  OPERATOR_NOTIFY_STATUS_PATH,
  OPERATOR_PIPELINES_PATH,
  OPERATOR_ROUTES,
  OPERATOR_STATIC_ASSET_PATTERN,
  OPERATOR_TASK_DIFF_ROUTE,
  OPERATOR_TASK_ACTIVITY_ROUTE,
  OPERATOR_TASK_CONTEXT_ROUTE,
  type OperatorRouteV1,
} from '../../src/effects/operator/server';

/**
 * The inventory claim under test is "zero browser writes". Probing a
 * running server proves how the routes that exist behave, never which routes
 * exist, so the gate is applied to the declared inventory as a value.
 */
function writeRouteIds(routes: readonly OperatorRouteV1[]): readonly string[] {
  return routes.filter((route) => route.write || !['GET', 'HEAD'].includes(route.method)).map((route) => route.id);
}

function collaborationSnapshot(
  overrides: Partial<OperatorCollaborationSnapshotV4> = {},
): OperatorCollaborationSnapshotV4 {
  return {
    protocol: OPERATOR_COLLABORATION_PROTOCOL,
    kind: OPERATOR_COLLABORATION_SNAPSHOT_KIND,
    repository_id: 'repo-a', decision_after: null,
    planning: { status: 'unavailable', observed_at: '2026-09-22T00:00:00.000Z', code: 'source_unavailable' },
    decisions: { status: 'unavailable', observed_at: '2026-09-22T00:00:00.000Z', code: 'source_unavailable' },
    exchange: { status: 'unavailable', observed_at: '2026-09-22T00:00:00.000Z', code: 'source_unavailable' },
    organization: { status: 'unavailable', observed_at: '2026-09-22T00:00:00.000Z', code: 'source_unavailable' },
    ...overrides,
  } as OperatorCollaborationSnapshotV4;
}

describe('operator structural write boundary', () => {
  test('declares zero write routes and rejects every mutation verb even when mislabeled read-only', () => {
    expect(writeRouteIds(OPERATOR_ROUTES)).toEqual([]);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const mutation: OperatorRouteV1 = { id: 'fake_write', method, pattern: '/api/v1/fleet/tasks/anything', write: false };
      expect(writeRouteIds([...OPERATOR_ROUTES, mutation])).toEqual(['fake_write']);
    }
    expect(writeRouteIds([...OPERATOR_ROUTES, { id: 'get_write', method: 'GET', pattern: '/api/write', write: true }])).toEqual(['get_write']);
  });

  test('the dispatcher only admits GET and HEAD before routing any request', async () => {
    const source = await Bun.file(new URL('../../src/effects/operator/server.ts', import.meta.url)).text();
    // Scan executable method comparisons as well as the declared inventory.
    // This catches a mutation branch omitted from OPERATOR_ROUTES.
    const methods = [...source.matchAll(/\bmethod\s*(?:!==|===|!=|==)\s*['"]([A-Z]+)['"]/gu)].map(match => match[1]);
    expect(methods.length).toBeGreaterThan(0);
    expect([...new Set(methods)].sort()).toEqual(['GET', 'HEAD']);
  });

  test('pins every inventory pattern to the value the dispatcher matches on', () => {
    const patterns = new Map(OPERATOR_ROUTES.map((route) => [route.id, route.pattern]));
    expect(patterns.size).toBe(OPERATOR_ROUTES.length);
    expect([...patterns.keys()]).toEqual([
      'health',
      'repository_snapshot',
      'fleet_snapshot',
      'collaboration_snapshot',
      'task_context',
      'task_activity',
      'task_diff',
      'pipelines',
      'notify_status',
      'architecture_modules',
      'architecture_module',
      'architecture_review_prompt',
      'static_asset',
    ]);
    expect(patterns.get('health')).toBe(OPERATOR_HEALTH_PATH);
    expect(patterns.get('repository_snapshot')).toBe(OPERATOR_REPOSITORY_SNAPSHOT_ROUTE.source);
    expect(patterns.get('fleet_snapshot')).toBe(OPERATOR_FLEET_SNAPSHOT_PATH);
    expect(patterns.get('collaboration_snapshot')).toBe(OPERATOR_COLLABORATION_SNAPSHOT_ROUTE.source);
    expect(patterns.get('task_context')).toBe(OPERATOR_TASK_CONTEXT_ROUTE.source);
    expect(patterns.get('task_activity')).toBe(OPERATOR_TASK_ACTIVITY_ROUTE.source);
    expect(patterns.get('task_diff')).toBe(OPERATOR_TASK_DIFF_ROUTE.source);
    expect(patterns.get('pipelines')).toBe(OPERATOR_PIPELINES_PATH);
    expect(patterns.get('notify_status')).toBe(OPERATOR_NOTIFY_STATUS_PATH);
    expect(patterns.get('architecture_modules')).toBe(OPERATOR_ARCHITECTURE_MODULES_ROUTE.source);
    expect(patterns.get('architecture_module')).toBe(OPERATOR_ARCHITECTURE_MODULE_ROUTE.source);
    expect(patterns.get('architecture_review_prompt')).toBe(OPERATOR_ARCHITECTURE_REVIEW_PROMPT_ROUTE.source);
    expect(patterns.get('static_asset')).toBe(OPERATOR_STATIC_ASSET_PATTERN);

    expect(OPERATOR_FLEET_SNAPSHOT_PATH.startsWith(OPERATOR_API_PATH_PREFIX)).toBe(true);
  });

  test('refuses a collaboration snapshot that does not echo the requested identity', () => {
    expect(() => assertOperatorCollaborationSnapshotIdentity(collaborationSnapshot(), 'repo-a')).not.toThrow();

    for (const [snapshot, requested] of [
      [collaborationSnapshot({ repository_id: 'repo-b' }), 'repo-a'],
      [collaborationSnapshot({ protocol: 99 as never }), 'repo-a'],
      [collaborationSnapshot({ kind: 'operator_fleet_snapshot' as never }), 'repo-a'],
      [{} as OperatorCollaborationSnapshotV4, 'repo-a'],
    ] as const) {
      let thrown: unknown;
      try {
        assertOperatorCollaborationSnapshotIdentity(snapshot, requested);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(OperatorCollaborationError);
      expect((thrown as OperatorCollaborationError).code).toBe('collaboration_repository_mismatch');
    }
  });
});
