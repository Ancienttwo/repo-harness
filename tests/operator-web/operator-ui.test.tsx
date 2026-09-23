import { beforeEach, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { OperatorApp, primaryCause } from '../../src/operator-web/App';
import {
  changedDuringReadSnapshot,
  degradedSnapshot,
  emptySnapshot,
  fixtureTasks,
  stableSnapshot,
} from '../../src/operator-web/fixture';
import { projectSnapshotViewState, snapshotViewKind } from '../../src/operator-web/types';

function renderStable(snapshot = stableSnapshot): string {
  return renderToStaticMarkup(<OperatorApp initialState={projectSnapshotViewState(snapshot)} initialLocale="en" />);
}

function ordered(markup: string, ...fragments: readonly string[]): boolean {
  let cursor = -1;
  for (const fragment of fragments) {
    const index = markup.indexOf(fragment);
    if (index <= cursor) return false;
    cursor = index;
  }
  return true;
}

beforeEach(() => {
  // These are server-render contracts. A DOM left behind by another suite would
  // let the responsive layout hook decide the markup instead of the assertions.
  delete (globalThis as { window?: unknown }).window;
});

describe('operator web control board', () => {
  test('UX-operator-worklist-v1-P1 orders the worklist by who has to act', () => {
    const markup = renderStable();

    expect(markup).toContain('data-state="stable"');
    expect(markup).toContain('Worklist');
    expect(ordered(
      markup,
      'Needs you',
      'Ready to merge',
      'Unreadable repos',
      'Unclassified',
      'Claimed / under review',
      'External',
      'Done',
    )).toBe(true);
    expect(markup).toContain('protocol 6');
    expect(markup).toContain('observe-only · one write: task message');
  });

  test('UX-operator-worklist-v1-P2 leads every row with the human task label, never the digest', () => {
    const markup = renderStable();

    expect(markup).toContain(fixtureTasks.available.task_label);
    expect(markup).toContain(fixtureTasks.blocked.task_label);
    expect(markup).not.toContain(fixtureTasks.console.task_label);
    expect(renderStable({ ...stableSnapshot, repositories: [...stableSnapshot.repositories].reverse() })).toContain(fixtureTasks.console.task_label);
    expect(markup).not.toContain(fixtureTasks.available.task_id);
    expect(markup).not.toContain(fixtureTasks.blocked.task_id);
  });

  test('UX-operator-worklist-v1-P3 expands only the first non-empty group by default', () => {
    const markup = renderStable();

    expect(markup).not.toContain(fixtureTasks.working.task_label);
    expect(markup).not.toContain(fixtureTasks.review.task_label);
    expect(markup).not.toContain(fixtureTasks.done.task_label);
    expect(markup).toContain('aria-label="Expand Claimed / under review"');
    expect(markup).toContain('aria-label="Collapse Needs you"');
    expect(markup).toContain('aria-label="Expand Unreadable repos"');
  });

  test('UX-operator-cause-v1-P1 states the cause in plain words and keeps the raw blocker code', () => {
    const markup = renderStable();

    expect(markup).toContain('The base branch moved after verification');
    expect(markup).toContain('base_moved_since_verification');
    const consoleMarkup = renderStable({ ...stableSnapshot, repositories: [...stableSnapshot.repositories].reverse() });
    expect(consoleMarkup).toContain('no progress');
    expect(markup).toContain('1 unread');
    expect(consoleMarkup).toContain('2 unread');
  });

  // `available` carries no blocker and no stall, so unread is its primary cause;
  // the row must not repeat that same count in the trailing signals.
  test('UX-operator-cause-v1-P2 states an unread primary cause exactly once on the row', () => {
    const markup = renderStable();

    const availableCard = stableSnapshot.repositories
      .flatMap((repository) => repository.cards)
      .find((entry) => entry.task_id === fixtureTasks.available.task_id);
    expect(primaryCause(availableCard!)?.kind).toBe('unread');
    expect((markup.match(/1 unread(?!able)/gu) ?? []).length).toBe(1);
  });

  test('UX-operator-statusbar-v1-P1 keeps age, sequence, consistency, and repo counts resident', () => {
    const markup = renderStable();

    expect(markup).toContain('observed');
    expect(markup).toContain('ago');
    expect(markup).toContain('seq');
    expect(markup).toContain('consistency');
    expect(markup).toContain('2 repos');
    expect(renderStable(degradedSnapshot)).toContain('1 unreadable');
  });

  test('UX-local-human-control-board-v1-N1 does not expose paths or mutation affordances', () => {
    const markup = renderStable();

    expect(markup).not.toContain('repo_root');
    expect(markup).not.toContain('/Users/');
    expect(markup).not.toContain('/private/');
    for (const affordance of ['Approve', 'Merge now', 'Start agent', 'Acquire', 'Takeover', 'Abandon', 'Reopen']) {
      expect(markup).not.toContain(affordance);
    }
    expect(markup).not.toContain('data-write-action');
    expect(markup).toContain('observe-only · one write: task message');
  });

  test('UX-local-human-control-board-v1-F1 renders a fatal authority failure instead of an empty success board', () => {
    const markup = renderToStaticMarkup(
      <OperatorApp
        initialLocale="en"
        initialState={{
          kind: 'fatal',
          error: {
            code: 'operator_api_unavailable',
            message: 'Fleet snapshot unavailable',
            next_action: 'Run `repo-harness fleet board --json` for diagnostics, then retry.',
          },
        }}
      />,
    );

    expect(markup).toContain('data-state="fatal"');
    expect(markup).toContain('Fleet snapshot unavailable');
    expect(markup).toContain('Run `repo-harness fleet board --json` for diagnostics, then retry.');
    expect(markup).toContain('Retry observation');
    expect(markup).not.toContain('no adopted repositories');
    expect(markup).not.toContain('data-state="empty"');
  });

  // Without a snapshot the board has observed no protocol at all. Printing the
  // constant the bundle was compiled against would state a fact about a
  // document that was never read.
  test('states an unobserved protocol and sequence as absent, not as the compiled constant', () => {
    const markup = renderToStaticMarkup(
      <OperatorApp
        initialLocale="en"
        initialState={{
          kind: 'fatal',
          error: {
            code: 'operator_api_unavailable',
            message: 'Fleet snapshot unavailable',
            next_action: 'Run `repo-harness fleet board --json` for diagnostics, then retry.',
          },
        }}
      />,
    );

    expect(markup).toContain('protocol — · sequence —');
    expect(markup).not.toContain('protocol 6');
  });

  test('keeps empty, changed-during-read, and repo-degraded semantics explicit', () => {
    expect(snapshotViewKind(emptySnapshot)).toBe('empty');
    expect(snapshotViewKind(changedDuringReadSnapshot)).toBe('changed-during-read');
    expect(snapshotViewKind(degradedSnapshot)).toBe('repo-degraded');
    expect(renderStable(emptySnapshot)).toContain('no adopted repositories');
    expect(renderStable(changedDuringReadSnapshot)).toContain('Snapshot changed during read');
    expect(renderStable(degradedSnapshot)).toContain('One or more repositories are degraded');
  });

  test('marks a row that changed during read without replacing its stage', () => {
    const markup = renderStable(changedDuringReadSnapshot);

    expect(markup).toContain(fixtureTasks.changed.task_label);
    expect(markup).toContain('changed during read');
    expect(markup).toContain('unclassified');
  });

  test('keeps unreadable repositories visible with their typed recovery message', () => {
    const unreadableOnly = {
      ...degradedSnapshot,
      repositories: degradedSnapshot.repositories.filter((repository) => repository.status === 'unreadable'),
      counts: { available: 0, working: 0, in_review: 0, ready_to_merge: 0, done: 0, unreadable: 1, unclassified: 0, preparation: 0, alternate_workflow: 0, isolated_execution: 0, known_tasks: 0 },
    } as const;
    const markup = renderStable(unreadableOnly);

    expect(markup).toContain('repo-unreadable');
    expect(markup).toContain('repository authority cannot be read');
    expect(markup).toContain('repo_unreadable');
  });
});

describe('repository automation supervision', () => {
  test('renders original decisions and unknown execution without deriving authorization or owners', async () => {
    const { AutomationEvidence } = await import('../../src/operator-web/AutomationSummary');
    const { repositoryObservationFixture } = await import('../../src/operator-web/fixture');
    const { decodeOperatorRepositorySnapshot } = await import('../../src/operator-web/repository-snapshot');
    const { translate } = await import('../../src/operator-web/i18n');
    const observation = decodeOperatorRepositorySnapshot(repositoryObservationFixture(), 'repo-harness');
    const markup = renderToStaticMarkup(<AutomationEvidence observation={observation} t={(key, values) => translate('en', key, values)} />);
    for (const value of ['Native execution evidence unavailable', 'executing', 'operator', 'dispatch_started',
      'grant-ui-observation', 'Stored grant only.', 'reconciliation_required', 'agent_turns',
      'Last stored decision', 'no_progress', observation.automation.grants.records[0]!.expires_at,
      observation.automation.controllers.records[0]!.event_sha256, 'Stale']) expect(markup).toContain(value);
    expect(markup).not.toContain('Agent is running');
    expect(markup).not.toContain('<button');
    const zh = renderToStaticMarkup(<AutomationEvidence observation={observation} t={(key, values) => translate('zh', key, values)} />);
    expect(zh).toContain('原生执行证据不可用');
    expect(zh).toContain('最近已存储决策');
    expect(zh).toContain('原始关注责任方');
  });

  test('keeps source absence, failure and stale budget metrics distinct', async () => {
    const { AutomationEvidence } = await import('../../src/operator-web/AutomationSummary');
    const { repositoryObservationFixture } = await import('../../src/operator-web/fixture');
    const { translate } = await import('../../src/operator-web/i18n');
    const original = repositoryObservationFixture('repo-console');
    const observation = { ...original, automation: { ...original.automation,
      policy: { ...original.automation.policy, status: 'unavailable' as const, reason: 'source_changed' as const, records: [] } } };
    const markup = renderToStaticMarkup(<AutomationEvidence observation={observation} t={(key, values) => translate('en', key, values)} />);
    expect(markup).toContain('data-source-status="unavailable"');
    expect(markup).toContain('data-source-status="missing"');
    expect(markup).toContain('source_changed');
    expect(markup).toContain('No record');
    expect(markup).toContain('Stale');
    expect(markup).toContain('>15</td>');
  });
});
