import { OPERATOR_SESSION_MESSAGES_ROUTE } from '../../src/core/operator/doc-session-messages';
import { OPERATOR_SESSION_LIST_PATH, OPERATOR_SESSION_DETAIL_ROUTE } from '../../src/core/operator/doc-session-views';
import { OPERATOR_SESSION_EVENTS_ROUTE } from '../../src/effects/operator/doc-session-events';
import { describe, expect, test } from 'bun:test';

import {
  OPERATOR_REPOSITORY_PROTOCOL,
  OPERATOR_REPOSITORY_SNAPSHOT_KIND,
  type OperatorRepositorySnapshotV1,
} from '../../src/core/operator/repository-snapshot';
import { OPERATOR_ARCHITECTURE_MAP_ROUTE } from '../../src/core/operator/architecture-map';
import {
  OperatorRepositoryError,
  assertOperatorRepositorySnapshotIdentity,
} from '../../src/effects/operator/repository-snapshot';
import {
  OPERATOR_API_PATH_PREFIX,
  OPERATOR_ARCHITECTURE_MODULES_ROUTE,
  OPERATOR_ARCHITECTURE_MODULE_ROUTE,
  OPERATOR_ARCHITECTURE_REVIEW_PROMPT_ROUTE,
  OPERATOR_REPOSITORY_SNAPSHOT_ROUTE,
  OPERATOR_TESTS_ROUTE,
  OPERATOR_EXECUTION_STATE_ROUTE,
  OPERATOR_DEV_ACTIVITY_PATH,
  OPERATOR_SETUP_PATH,
  OPERATOR_BOT_ACCESS_PATH,
  OPERATOR_CLI_INVENTORY_PATH,
  OPERATOR_DOCS_TREE_ROUTE,
  OPERATOR_DOCS_FILE_ROUTE,
  OPERATOR_FLEET_SNAPSHOT_PATH,
  OPERATOR_HEALTH_PATH,
  OPERATOR_NOTIFY_STATUS_PATH,
  OPERATOR_RUNTIME_STATUS_PATH,
  OPERATOR_ROUTES,
  OPERATOR_STATIC_ASSET_PATTERN,
  OPERATOR_TASK_SESSIONS_ROUTE,
  OPERATOR_TASK_DIFF_ROUTE,
  OPERATOR_TASK_ACTIVITY_ROUTE,
  OPERATOR_HISTORICAL_TASK_ACTIVITY_ROUTE,
  OPERATOR_TASK_CONTEXT_ROUTE,
  OPERATOR_TASK_HISTORY_ROUTE,
  type OperatorRouteV1,
} from '../../src/effects/operator/server';
import { OPERATOR_SETTINGS_AGENTS_PATH, OPERATOR_SETTINGS_AGENTS_ROUTE } from '../../src/effects/operator/agents-settings-route';
import { OPERATOR_WORKTREES_CLEANUP_ROUTE } from '../../src/effects/operator/worktree-cleanup';
import { OPERATOR_SESSIONS_ROUTE, OPERATOR_SESSION_STOP_ROUTE } from '../../src/effects/operator/doc-session';
import { OPERATOR_SESSION_DIFF_ROUTE, OPERATOR_SESSION_LOSS_ROUTE } from '../../src/effects/operator/doc-session-changes';

/**
 * The inventory claim under test is "zero browser writes". Probing a
 * running server proves how the routes that exist behave, never which routes
 * exist, so the gate is applied to the declared inventory as a value.
 */
function writeRouteIds(routes: readonly OperatorRouteV1[]): readonly string[] {
  return routes.filter((route) => route.write || !['GET', 'HEAD'].includes(route.method)).map((route) => route.id);
}

function repositorySnapshot(
  overrides: Partial<OperatorRepositorySnapshotV1> = {},
): OperatorRepositorySnapshotV1 {
  return {
    protocol: OPERATOR_REPOSITORY_PROTOCOL,
    kind: OPERATOR_REPOSITORY_SNAPSHOT_KIND,
    repository_id: 'repo-a',
    planning: { status: 'unavailable', observed_at: '2026-09-22T00:00:00.000Z', code: 'source_unavailable' },
    organization: { status: 'unavailable', observed_at: '2026-09-22T00:00:00.000Z', code: 'source_unavailable' },
    ...overrides,
  } as OperatorRepositorySnapshotV1;
}

describe('operator structural write boundary', () => {
  test('declares only the five admitted write routes and rejects every mutation verb even when mislabeled read-only', () => {
    expect(writeRouteIds(OPERATOR_ROUTES)).toEqual(['worktrees_cleanup', 'settings_agents_write', 'sessions_create', 'sessions_messages', 'sessions_stop']);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const mutation: OperatorRouteV1 = { id: 'fake_write', method, pattern: '/api/v1/fleet/tasks/anything', write: false };
      expect(writeRouteIds([...OPERATOR_ROUTES, mutation])).toEqual(['worktrees_cleanup', 'settings_agents_write', 'sessions_create', 'sessions_messages', 'sessions_stop', 'fake_write']);
    }
    expect(writeRouteIds([...OPERATOR_ROUTES, { id: 'get_write', method: 'GET', pattern: '/api/write', write: true }])).toEqual(['worktrees_cleanup', 'settings_agents_write', 'sessions_create', 'sessions_messages', 'sessions_stop', 'get_write']);
  });

  test('the dispatcher admits only GET, HEAD and, for a write route, POST', async () => {
    const source = await Bun.file(new URL('../../src/effects/operator/server.ts', import.meta.url)).text();
    // Scan executable method comparisons as well as the declared inventory.
    // This catches a mutation branch omitted from OPERATOR_ROUTES.
    const methods = [...source.matchAll(/\bmethod\s*(?:!==|===|!=|==)\s*['"]([A-Z]+)['"]/gu)].map(match => match[1]);
    expect(methods.length).toBeGreaterThan(0);
    expect([...new Set(methods)].sort()).toEqual(['GET', 'HEAD', 'POST']);
    // POST has one branch, and it reaches only a matched write route.
    expect(source.match(/handleOperatorWrite\(/gu)).toHaveLength(1);
    expect(source).toMatch(/if \(write\) \{\n\s+if \(writeMatch === null\) \{/u);
  });

  test('pins every inventory pattern to the value the dispatcher matches on', () => {
    const patterns = new Map(OPERATOR_ROUTES.map((route) => [route.id, route.pattern]));
    expect(patterns.size).toBe(OPERATOR_ROUTES.length);
    expect([...patterns.keys()]).toEqual([
      'health',
      'fleet_snapshot',
      'repository_snapshot',
      'task_history',
      'task_context',
      'historical_task_activity',
      'task_activity',
      'task_sessions',
      'task_diff',
      'runtime_status',
      'notify_status',
      'dev_activity',
      'worktrees',
      'worktrees_cleanup',
      'setup',
      'bot_access',
      'cli_inventory',
      'tests',
      'execution_state',
      'docs_tree',
      'docs_file',
      'session_list',
      'session_detail',
      'session_events',
      'session_diff',
      'session_loss',
      'settings_agents',
      'settings_agents_write',
      'sessions_create',
      'sessions_messages',
      'sessions_stop',
      'architecture_modules',
      'architecture_module',
      'architecture_review_prompt',
      'architecture_map',
      'static_asset',
    ]);
    expect(patterns.get('health')).toBe(OPERATOR_HEALTH_PATH);
    expect(patterns.get('fleet_snapshot')).toBe(OPERATOR_FLEET_SNAPSHOT_PATH);
    expect(patterns.get('repository_snapshot')).toBe(OPERATOR_REPOSITORY_SNAPSHOT_ROUTE.source);
    expect(patterns.get('task_history')).toBe(OPERATOR_TASK_HISTORY_ROUTE.source);
    expect(patterns.get('task_context')).toBe(OPERATOR_TASK_CONTEXT_ROUTE.source);
    expect(patterns.get('historical_task_activity')).toBe(OPERATOR_HISTORICAL_TASK_ACTIVITY_ROUTE.source);
    expect(patterns.get('task_activity')).toBe(OPERATOR_TASK_ACTIVITY_ROUTE.source);
    expect(patterns.get('task_sessions')).toBe(OPERATOR_TASK_SESSIONS_ROUTE.source);
    expect(patterns.get('task_diff')).toBe(OPERATOR_TASK_DIFF_ROUTE.source);
    expect(patterns.get('runtime_status')).toBe(OPERATOR_RUNTIME_STATUS_PATH);
    expect(patterns.get('notify_status')).toBe(OPERATOR_NOTIFY_STATUS_PATH);
    expect(patterns.get('dev_activity')).toBe(OPERATOR_DEV_ACTIVITY_PATH);
    expect(OPERATOR_ROUTES.find(route => route.id === 'dev_activity')).toEqual({ id: 'dev_activity', method: 'GET', pattern: '/api/v1/dev-activity', write: false });
    expect(patterns.get('setup')).toBe(OPERATOR_SETUP_PATH);
    expect(OPERATOR_ROUTES.find(route => route.id === 'setup')).toEqual({ id: 'setup', method: 'GET', pattern: '/api/v1/setup', write: false });
    expect(patterns.get('bot_access')).toBe(OPERATOR_BOT_ACCESS_PATH);
    expect(OPERATOR_ROUTES.find(route => route.id === 'bot_access')).toEqual({ id: 'bot_access', method: 'GET', pattern: '/api/v1/bot-access', write: false });
    expect(patterns.get('cli_inventory')).toBe(OPERATOR_CLI_INVENTORY_PATH);
    expect(OPERATOR_ROUTES.find(route => route.id === 'cli_inventory')).toEqual({ id: 'cli_inventory', method: 'GET', pattern: '/api/v1/cli-inventory', write: false });
    expect(OPERATOR_ROUTES.find(route => route.id === 'tests')).toEqual({ id: 'tests', method: 'GET', pattern: OPERATOR_TESTS_ROUTE.source, write: false });
    expect(OPERATOR_ROUTES.find(route => route.id === 'execution_state')).toEqual({ id: 'execution_state', method: 'GET', pattern: OPERATOR_EXECUTION_STATE_ROUTE.source, write: false });
    expect(patterns.get('docs_tree')).toBe(OPERATOR_DOCS_TREE_ROUTE.source);
    expect(patterns.get('docs_file')).toBe(OPERATOR_DOCS_FILE_ROUTE.source);
    expect(OPERATOR_ROUTES.filter(route => route.id.startsWith('docs_')).every(route => route.method === 'GET' && !route.write)).toBe(true);
    expect(OPERATOR_ROUTES.find(route => route.id === 'session_list')).toEqual({ id: 'session_list', method: 'GET', pattern: OPERATOR_SESSION_LIST_PATH, write: false });
    expect(OPERATOR_ROUTES.find(route => route.id === 'session_detail')).toEqual({ id: 'session_detail', method: 'GET', pattern: OPERATOR_SESSION_DETAIL_ROUTE.source, write: false });
    expect(OPERATOR_ROUTES.find(route => route.id === 'session_events')).toEqual({ id: 'session_events', method: 'GET', pattern: OPERATOR_SESSION_EVENTS_ROUTE.source, write: false });
    expect(OPERATOR_ROUTES.find(route => route.id === 'session_diff')).toEqual({ id: 'session_diff', method: 'GET', pattern: OPERATOR_SESSION_DIFF_ROUTE.source, write: false });
    expect(OPERATOR_ROUTES.find(route => route.id === 'session_loss')).toEqual({ id: 'session_loss', method: 'GET', pattern: OPERATOR_SESSION_LOSS_ROUTE.source, write: false });
    expect(OPERATOR_ROUTES.find(route => route.id === 'settings_agents')).toEqual({ id: 'settings_agents', method: 'GET', pattern: OPERATOR_SETTINGS_AGENTS_PATH, write: false });
    expect(OPERATOR_ROUTES.find(route => route.id === 'settings_agents_write')).toEqual({ id: 'settings_agents_write', method: 'POST', pattern: OPERATOR_SETTINGS_AGENTS_ROUTE.source, write: true });
    expect(OPERATOR_ROUTES.find(route => route.id === 'worktrees_cleanup')).toEqual({ id: 'worktrees_cleanup', method: 'POST', pattern: OPERATOR_WORKTREES_CLEANUP_ROUTE.source, write: true });
    expect(OPERATOR_ROUTES.find(route => route.id === 'sessions_create')).toEqual({ id: 'sessions_create', method: 'POST', pattern: OPERATOR_SESSIONS_ROUTE.source, write: true });
    expect(OPERATOR_ROUTES.find(route => route.id === 'sessions_messages')).toEqual({ id: 'sessions_messages', method: 'POST', pattern: OPERATOR_SESSION_MESSAGES_ROUTE.source, write: true });
    expect(OPERATOR_ROUTES.find(route => route.id === 'sessions_stop')).toEqual({ id: 'sessions_stop', method: 'POST', pattern: OPERATOR_SESSION_STOP_ROUTE.source, write: true });
    expect(patterns.get('architecture_modules')).toBe(OPERATOR_ARCHITECTURE_MODULES_ROUTE.source);
    expect(patterns.get('architecture_module')).toBe(OPERATOR_ARCHITECTURE_MODULE_ROUTE.source);
    expect(patterns.get('architecture_review_prompt')).toBe(OPERATOR_ARCHITECTURE_REVIEW_PROMPT_ROUTE.source);
    expect(OPERATOR_ROUTES.find(route => route.id === 'architecture_map')).toEqual({ id: 'architecture_map', method: 'GET', pattern: OPERATOR_ARCHITECTURE_MAP_ROUTE.source, write: false });
    expect(patterns.get('static_asset')).toBe(OPERATOR_STATIC_ASSET_PATTERN);

    expect(OPERATOR_FLEET_SNAPSHOT_PATH.startsWith(OPERATOR_API_PATH_PREFIX)).toBe(true);
  });

  test('refuses a repository snapshot that does not echo the requested identity', () => {
    expect(() => assertOperatorRepositorySnapshotIdentity(repositorySnapshot(), 'repo-a')).not.toThrow();

    for (const [snapshot, requested] of [
      [repositorySnapshot({ repository_id: 'repo-b' }), 'repo-a'],
      [repositorySnapshot({ protocol: 99 as never }), 'repo-a'],
      [repositorySnapshot({ kind: 'operator_fleet_snapshot' as never }), 'repo-a'],
      [{} as OperatorRepositorySnapshotV1, 'repo-a'],
    ] as const) {
      let thrown: unknown;
      try {
        assertOperatorRepositorySnapshotIdentity(snapshot, requested);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(OperatorRepositoryError);
      expect((thrown as OperatorRepositoryError).code).toBe('repository_mismatch');
    }
  });
});
