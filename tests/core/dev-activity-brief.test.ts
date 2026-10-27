import { describe, expect, test } from 'bun:test';
import { formatDevActivityBrief } from '../../src/core/dev-activity/brief';
import { unavailableDevActivitySnapshot } from '../../src/core/dev-activity/decode';
import { projectDevActivity, type DevActivityRawPullRequest, type DevActivityRawRepository } from '../../src/core/dev-activity/projection';
import { DEV_ACTIVITY_COLUMNS, DEV_ACTIVITY_SHIPPED_WINDOW_MS, type DevActivityItem, type DevActivitySnapshotV2 } from '../../src/core/dev-activity/types';

const NOW = Date.parse('2026-10-17T12:00:00.000Z');
const AT = new Date(NOW).toISOString();
const REPO = 'repo_0123456789abcdef';

function pr(overrides: Partial<DevActivityRawPullRequest> = {}): DevActivityRawPullRequest {
  return {
    number: 7, title: 'Add widgets', url: 'https://github.com/acme/widgets/pull/7', state: 'open',
    is_draft: false, head_branch: 'feat/widgets', base_branch: 'main', merge_state: 'CLEAN',
    ci: 'success', review: 'approved', created_at: AT, updated_at: AT, merged_at: null, closed_at: null,
    ...overrides,
  };
}

function snapshot(overrides: Partial<DevActivityRawRepository> = {}): DevActivitySnapshotV2 {
  return projectDevActivity({
    collected_at: AT, now_ms: NOW, unreadable_registrations: 0,
    repositories: [{
      repository_id: REPO, display_name: 'widgets', github: 'acme/widgets', default_branch: 'main',
      sources: [
        { kind: 'git', status: 'ok', reason: null, observed_at: AT },
        { kind: 'github', status: 'ok', reason: null, observed_at: AT },
        { kind: 'runtime', status: 'not_configured', reason: 'runtime_not_configured', observed_at: null },
      ],
      worktrees: [], pull_requests: [], ...overrides,
    }],
  });
}

function item(overrides: Partial<DevActivityItem> = {}): DevActivityItem {
  return {
    id: `${REPO}:feat/local`, repository_id: REPO, branch: 'feat/local', title: 'feat/local',
    column: 'building', hidden: null, column_since: null, pull_request: null,
    worktrees: [{ directory: 'local-worktree', head_sha: 'a'.repeat(40), dirty: false, ahead: 1, behind: 0 }],
    ...overrides,
  };
}

describe('development activity brief', () => {
  test('renders empty and unavailable snapshots without claiming source health', () => {
    expect(formatDevActivityBrief({ ...unavailableDevActivitySnapshot(), status: 'ready' })).toBe('Nothing needs you.');
    expect(formatDevActivityBrief(unavailableDevActivitySnapshot())).toBe('Nothing needs you.\nSnapshot unavailable.');
    expect(formatDevActivityBrief(snapshot())).toBe('Nothing needs you.\n\nwidgets (0 active)');
  });

  test('names the cause of each attention kind', () => {
    const data = snapshot({ pull_requests: [
      pr({ number: 1, head_branch: 'feat/a', review: 'changes_requested', merge_state: 'BLOCKED', created_at: '2026-10-10T00:00:00.000Z' }),
      pr({ number: 2, head_branch: 'feat/b', merge_state: 'DIRTY', created_at: '2026-10-11T00:00:00.000Z' }),
      pr({ number: 3, head_branch: 'feat/c', ci: 'failure', merge_state: 'BLOCKED', created_at: '2026-10-12T00:00:00.000Z' }),
    ] });
    expect(formatDevActivityBrief(data).split('\n').slice(0, 6)).toEqual([
      '3 item(s) need you.', '', 'Needs you',
      'widgets: PR #1 - changes requested', 'widgets: PR #2 - merge conflict', 'widgets: PR #3 - checks failed',
    ]);
  });

  test('a dropped PR category adds a source line and keeps the other item lines', () => {
    const data = snapshot({ pull_requests: [pr()] });
    const github = data.repositories[0]!.sources.find(source => source.kind === 'github')!;
    github.status = 'unavailable';
    github.reason = 'github_truncated_merged';
    expect(formatDevActivityBrief(data).split('\n').slice(-2)).toEqual(['  source github unavailable', '  [open PR #7] feat/widgets - Add widgets']);
    github.reason = 'gh_failed';
    expect(formatDevActivityBrief(data).split('\n').slice(-2)).toEqual(['widgets (1 active)', '  source github unavailable']);
  });

  test('uses snapshot attention in its order and does not cap it', () => {
    const data = snapshot({ pull_requests: [pr(), pr({ number: 8, head_branch: 'feat/next', title: 'Next' })] });
    expect(formatDevActivityBrief(data, 1)).toBe([
      '2 item(s) need you.', '', 'Needs you', 'widgets: PR #8 - ready to merge', 'widgets: PR #7 - ready to merge',
      '', 'widgets (2 active)', '  [open PR #8] feat/next - Next', '  +1 more',
    ].join('\n'));
  });

  test('maps every open PR CI, review, draft, merge and dirtiness combination', () => {
    for (const ci of ['success', 'failure', 'pending', 'none'] as const) {
      for (const review of ['approved', 'changes_requested', 'review_required', 'none'] as const) {
        for (const is_draft of [false, true]) {
          for (const merge_state of ['CLEAN', 'BLOCKED', 'DIRTY', 'UNKNOWN']) {
            for (const dirty of [false, true]) {
              const data = snapshot({
                pull_requests: [pr({ ci, review, is_draft, merge_state })],
                worktrees: [{ ...item().worktrees[0]!, branch: 'feat/widgets', dirty }],
              });
              const expected = ci === 'failure' ? '[blocked: CI failed] #7'
                : review === 'changes_requested' ? '[blocked: changes requested] #7'
                  : merge_state === 'DIRTY' ? '[blocked: merge conflict] #7' : '[open PR #7]';
              const line = formatDevActivityBrief(data).split('\n').find(value => value.startsWith('  ['))!;
              expect(line).toBe(`  ${expected} feat/widgets - Add widgets`);
              expect(line.match(/\[[^\]]+\]/gu)).toHaveLength(1);
              expect(formatDevActivityBrief(data).split('\n')[0]).toBe(data.attention.length ? '1 item(s) need you.' : 'Nothing needs you.');
            }
          }
        }
      }
    }
  });

  test('maps no-PR items in every column with clean and dirty worktrees', () => {
    for (const column of DEV_ACTIVITY_COLUMNS) {
      for (const dirty of [false, true]) {
        const data = snapshot();
        data.items = [item({ column, worktrees: [{ ...item().worktrees[0]!, dirty }] })];
        const tag = dirty ? 'uncommitted' : column === 'planned' ? 'planned' : 'in flight';
        expect(formatDevActivityBrief(data)).toContain(`  [${tag} feat/local]`);
      }
    }
    const data = snapshot();
    data.items = [item({ worktrees: [item().worktrees[0]!, { ...item().worktrees[0]!, dirty: true }] })];
    expect(formatDevActivityBrief(data)).toContain('[uncommitted feat/local]');
    data.items = [item({ column: 'planned', worktrees: [] })];
    expect(formatDevActivityBrief(data)).toContain('[planned feat/local]');
  });

  test('merged wins over worktree dirtiness and old CI or review state', () => {
    const data = snapshot({
      pull_requests: [pr({ state: 'merged', ci: null, review: 'changes_requested', merge_state: 'DIRTY', merged_at: AT, closed_at: AT })],
      worktrees: [{ ...item().worktrees[0]!, branch: 'feat/widgets', dirty: true }],
    });
    expect(formatDevActivityBrief(data)).toBe('Nothing needs you.\n\nwidgets (0 active)\n  [merged #7] feat/widgets - Add widgets');
  });

  test('keeps the exact shipped window from the projection and hides closed PRs', () => {
    const data = snapshot({ pull_requests: [
      pr({ state: 'merged', ci: null, merged_at: new Date(NOW - DEV_ACTIVITY_SHIPPED_WINDOW_MS).toISOString() }),
      pr({ number: 8, head_branch: 'feat/old', state: 'merged', ci: null, merged_at: new Date(NOW - DEV_ACTIVITY_SHIPPED_WINDOW_MS - 1).toISOString() }),
      pr({ number: 9, head_branch: 'feat/closed', state: 'closed', ci: null, closed_at: AT }),
    ] });
    const text = formatDevActivityBrief(data);
    expect(text).toContain('[merged #7]');
    expect(text).not.toContain('feat/old');
    expect(text).not.toContain('feat/closed');
    expect(text).toContain('widgets (0 active)');
    expect(text).not.toContain('Needs you');
  });

  test('uses repository order, counts all active items and caps each repository', () => {
    const data = snapshot();
    const second = { ...data.repositories[0]!, repository_id: 'repo_fedcba9876543210', display_name: 'second' };
    data.repositories.unshift(second);
    data.items = Array.from({ length: 12 }, (_, index) => item({ id: `${REPO}:feat/${index}`, branch: `feat/${index}`, title: `feat/${index}` }));
    data.items.push(item({ id: `${second.repository_id}:feat/local`, repository_id: second.repository_id }));
    const text = formatDevActivityBrief(data);
    expect(text.indexOf('second (1 active)')).toBeLessThan(text.indexOf('widgets (12 active)'));
    expect(text.match(/\[in flight /gu)).toHaveLength(11);
    expect(text).toEndWith('  +2 more');
    expect(formatDevActivityBrief(data, 12)).not.toContain(' more');
  });

  test('reports every non-ok Git and GitHub status instead of item tags', () => {
    for (const kind of ['git', 'github'] as const) {
      for (const status of ['unavailable', 'stale', 'not_configured'] as const) {
        const data = snapshot();
        data.items = [item()];
        data.repositories[0]!.sources.find(source => source.kind === kind)!.status = status;
        expect(formatDevActivityBrief(data)).toBe(`Nothing needs you.\n\nwidgets (1 active)\n  source ${kind} ${status}`);
      }
    }
    const data = snapshot();
    data.repositories[0]!.sources[0]!.status = 'unavailable';
    data.repositories[0]!.sources[1]!.status = 'stale';
    expect(formatDevActivityBrief(data)).toContain('source git unavailable\n  source github stale');
    data.unreadable_registrations = 2;
    expect(formatDevActivityBrief(data)).toEndWith('2 registered repositories unreadable.');
  });

  test('bounds all lines, preserves a complete tag and hides metadata and paths', () => {
    const data = snapshot({ pull_requests: [pr({ title: `Fix [/Users/private/secret] [open PR #99]\n\u001b ${'界😀'.repeat(100)}` })] });
    data.items[0]!.worktrees = item().worktrees;
    const before = structuredClone(data);
    const text = formatDevActivityBrief(data);
    expect(text).toContain('…');
    expect(text).not.toContain('/Users/private');
    expect(text).not.toContain('local-worktree');
    expect(text).not.toContain('a'.repeat(40));
    expect(text).not.toContain('https://');
    expect(text).not.toContain('\u001b');
    expect(text.split('\n').find(line => line.startsWith('  ['))!.match(/\[[^\]]+\]/gu)).toHaveLength(1);
    expect(data).toEqual(before);
    for (const withPr of [false, true]) {
      const long = snapshot();
      long.repositories[0]!.display_name = 'repo'.repeat(100);
      long.items = [item({ branch: 'feat/'.repeat(100), title: 'title'.repeat(100), pull_request: withPr ? pr() : null })];
      long.attention = [{ kind: 'ready_to_merge', subject_id: long.items[0]!.id, repository_id: REPO, summary: 'Ready', waiting_since: AT, url: null, command: null }];
      for (const line of formatDevActivityBrief(long).split('\n')) expect(line.length).toBeLessThan(100);
      expect(formatDevActivityBrief(long).split('\n').find(line => line.startsWith('  ['))).toMatch(/\[[^\]]+\]/u);
    }
  });

  test('rejects invalid caps', () => {
    for (const max of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => formatDevActivityBrief(snapshot(), max)).toThrow('positive integer');
    }
  });
});
