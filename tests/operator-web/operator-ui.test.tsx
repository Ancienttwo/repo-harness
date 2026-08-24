import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { OperatorApp } from '../../src/operator-web/App';
import {
  changedDuringReadSnapshot,
  degradedSnapshot,
  emptySnapshot,
  stableSnapshot,
} from '../../src/operator-web/fixture';
import { projectSnapshotViewState, snapshotViewKind } from '../../src/operator-web/types';

function renderStable(snapshot = stableSnapshot): string {
  return renderToStaticMarkup(<OperatorApp initialState={projectSnapshotViewState(snapshot)} />);
}

describe('operator web control board', () => {
  test('UX-local-human-control-board-v1-P1 renders the authoritative five columns and task drawer affordance', () => {
    const markup = renderStable();

    expect(markup).toContain('data-state="stable"');
    expect(markup).toContain('Fleet summary');
    expect(markup).toContain('Attention Inbox');
    expect(markup).toContain('Available');
    expect(markup).toContain('Working');
    expect(markup).toContain('In review');
    expect(markup).toContain('Ready to merge');
    expect(markup).toContain('Done');
    expect(markup).toContain('task-available');
    expect(markup).toContain('protocol 1');
    expect(markup).toContain('read-only / localhost');
  });

  test('UX-local-human-control-board-v1-N1 does not expose paths or mutation affordances', () => {
    const markup = renderStable();

    expect(markup).not.toContain('repo_root');
    expect(markup).not.toContain('/Users/');
    expect(markup).not.toContain('/private/');
    expect(markup).not.toContain('Approve');
    expect(markup).not.toContain('Merge now');
    expect(markup).not.toContain('Start agent');
    expect(markup).toContain('read-only / localhost');
  });

  test('UX-local-human-control-board-v1-F1 renders a fatal authority failure instead of an empty success board', () => {
    const markup = renderToStaticMarkup(
      <OperatorApp
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

  test('keeps empty, changed-during-read, and repo-degraded semantics explicit', () => {
    expect(snapshotViewKind(emptySnapshot)).toBe('empty');
    expect(snapshotViewKind(changedDuringReadSnapshot)).toBe('changed-during-read');
    expect(snapshotViewKind(degradedSnapshot)).toBe('repo-degraded');
    expect(renderStable(emptySnapshot)).toContain('no adopted repositories');
    expect(renderStable(changedDuringReadSnapshot)).toContain('Snapshot changed during read');
    expect(renderStable(degradedSnapshot)).toContain('One or more repositories are degraded');
    expect(renderStable(changedDuringReadSnapshot)).toContain('not classified');
    expect(renderStable(degradedSnapshot)).toContain('repo-unreadable');
  });
});
