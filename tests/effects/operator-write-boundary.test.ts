import { describe, expect, test } from 'bun:test';

import {
  OPERATOR_COLLABORATION_PROTOCOL,
  OPERATOR_COLLABORATION_SNAPSHOT_KIND,
  type OperatorCollaborationSnapshotV1,
} from '../../src/core/operator/collaboration-snapshot';
import {
  OperatorCollaborationError,
  assertOperatorCollaborationSnapshotIdentity,
} from '../../src/effects/operator/collaboration';
import {
  OPERATOR_API_PATH_PREFIX,
  OPERATOR_COLLABORATION_SNAPSHOT_ROUTE,
  OPERATOR_FLEET_SNAPSHOT_PATH,
  OPERATOR_HEALTH_PATH,
  OPERATOR_ROUTES,
  OPERATOR_STATIC_ASSET_PATTERN,
  OPERATOR_TASK_MESSAGE_ROUTE,
  type OperatorRouteV1,
} from '../../src/effects/operator/server';

/**
 * The inventory claim under test is "exactly one browser write". Probing a
 * running server proves how the routes that exist behave, never which routes
 * exist, so the gate is applied to the declared inventory as a value.
 */
function writeRouteIds(routes: readonly OperatorRouteV1[]): readonly string[] {
  return routes.filter((route) => route.write).map((route) => route.id);
}

function collaborationSnapshot(
  overrides: Partial<OperatorCollaborationSnapshotV1> = {},
): OperatorCollaborationSnapshotV1 {
  return {
    protocol: OPERATOR_COLLABORATION_PROTOCOL,
    kind: OPERATOR_COLLABORATION_SNAPSHOT_KIND,
    repository_id: 'repo-a',
    ...overrides,
  } as OperatorCollaborationSnapshotV1;
}

describe('operator structural write boundary', () => {
  test('declares exactly one write route and the negative probe fails the same assertion', () => {
    expect(writeRouteIds(OPERATOR_ROUTES)).toEqual(['task_message']);

    const undeclaredWrite: OperatorRouteV1 = {
      id: 'fake_write',
      method: 'POST',
      pattern: '/api/v1/fleet/tasks/anything',
      write: true,
    };
    expect(writeRouteIds([...OPERATOR_ROUTES, undeclaredWrite])).not.toEqual(['task_message']);
  });

  test('pins every inventory pattern to the value the dispatcher matches on', () => {
    const patterns = new Map(OPERATOR_ROUTES.map((route) => [route.id, route.pattern]));
    expect(patterns.size).toBe(OPERATOR_ROUTES.length);
    expect([...patterns.keys()]).toEqual([
      'health',
      'fleet_snapshot',
      'collaboration_snapshot',
      'static_asset',
      'task_message',
    ]);
    expect(patterns.get('health')).toBe(OPERATOR_HEALTH_PATH);
    expect(patterns.get('fleet_snapshot')).toBe(OPERATOR_FLEET_SNAPSHOT_PATH);
    expect(patterns.get('collaboration_snapshot')).toBe(OPERATOR_COLLABORATION_SNAPSHOT_ROUTE.source);
    expect(patterns.get('static_asset')).toBe(OPERATOR_STATIC_ASSET_PATTERN);
    expect(patterns.get('task_message')).toBe(OPERATOR_TASK_MESSAGE_ROUTE.source);

    expect(OPERATOR_FLEET_SNAPSHOT_PATH.startsWith(OPERATOR_API_PATH_PREFIX)).toBe(true);
    expect(OPERATOR_TASK_MESSAGE_ROUTE.test('/api/v1/fleet/tasks/repo-a/'.concat('b'.repeat(64), '/messages'))).toBe(true);
    expect(OPERATOR_TASK_MESSAGE_ROUTE.test('/API/v1/fleet/tasks/repo-a/'.concat('b'.repeat(64), '/messages'))).toBe(false);
  });

  test('refuses a collaboration snapshot that does not echo the requested identity', () => {
    expect(() => assertOperatorCollaborationSnapshotIdentity(collaborationSnapshot(), 'repo-a')).not.toThrow();

    for (const [snapshot, requested] of [
      [collaborationSnapshot({ repository_id: 'repo-b' }), 'repo-a'],
      [collaborationSnapshot({ protocol: 99 as never }), 'repo-a'],
      [collaborationSnapshot({ kind: 'operator_fleet_snapshot' as never }), 'repo-a'],
      [{} as OperatorCollaborationSnapshotV1, 'repo-a'],
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
