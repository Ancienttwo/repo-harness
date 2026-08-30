#!/usr/bin/env bun

import { fenceCollaborationDispatch } from '../src/effects/collaboration/context-delivery';
import { dispatchDelegatedRun } from '../src/effects/engineers/delegated-run-store';

const PROTECTED_PATHS = Object.freeze([
  'common:.repo-harness-read-only-canary-common',
  'worktree:.repo-harness-read-only-canary-worktree',
]);

if (process.argv.length !== 5) {
  console.error('usage: bun scripts/c9-collaboration-dispatch-runner.ts <repo> <dispatch-id> <observed-at>');
  process.exit(2);
}

const [, , repoRoot, dispatchId, observedAt] = process.argv;
fenceCollaborationDispatch({ repo_root: repoRoot!, dispatch_id: dispatchId! });
const status = dispatchDelegatedRun({
  repo_root: repoRoot!,
  dispatch_id: dispatchId!,
  observed_at: observedAt!,
  protected_paths: PROTECTED_PATHS,
});
console.log(JSON.stringify({
  dispatch_id: dispatchId,
  state: status.current.state,
  failure_class: status.current.failure_class,
}));
process.exit(status.current.state === 'completed' ? 0 : 1);
