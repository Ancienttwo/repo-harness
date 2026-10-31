# Task Scope and Delegation

Ordinary work is described in its PR: goal, scope, changes, verification, risk
and rollback. The delegation brief contains Goal, Scope, Context, Acceptance,
Verify, Rollback, Timebox, Forbidden, Report and Standing. A separate plan,
contract, review or notes file is not a prerequisite. Record a one-time decision
in the issue. PRDs are for genuinely new products.

## Delegation Brief

The brief and standing-orders pattern is adapted from pstack (cursor/plugins, MIT, Lauren Tan).
Fill every field before a spawn or resume. A field the parent cannot fill means
the unit is not yet scoped. Do not spawn that unit.

| Field | Required content |
| --- | --- |
| Goal | State the result the worker must deliver. |
| Scope | Name the files and behavior the worker owns. |
| Context | Paste upstream reports in full when the unit depends on them. Workers cannot see sibling reports. State when no upstream report is needed. |
| Acceptance | Give one checkable condition per line. |
| Verify | Name the commands and expected results. Name who runs each command. |
| Rollback | State how to undo the change. |
| Timebox | Set the time limit and the action at expiry. |
| Forbidden | Forbid retarget, merge, rebase, force-push and edits outside Scope unless the brief grants them. List other task limits. |
| Report | Require status, branch, head SHA, PRs, what actually ran and deviations. |
| Standing | Identify the current checkout's `.ai/harness/standing-orders.md`. The hook supplies its text. Do not paste a second copy. State when no standing constraints apply. |

The user or parent edits the register in the current checkout. Use one `N. text`
constraint per line. Start at 1 and use consecutive numbers. Do not add headings.
The hooks inject a bounded block. See [Standing orders](hook-operations.md#standing-orders).

## Risk and Review

Normal changes use typecheck and affected tests. Large changes, security/permissions,
or unresolved model uncertainty trigger gatekeeper/cross-model review on demand.
Only main publication, deletion, credentials/permissions and release/production are
hard boundaries; the latter two require user approval. Reviewers consume existing results.

## Testing Policy and Artifact Standards

[AGENTS.md](../../AGENTS.md#testing) is the repo's testing policy: verify changed
behavior once, run full coverage daily, open repair tasks for failures, and report gaps.
Record actual commands and outcomes in the PR; do not require receipts, waivers or pre-fix logs.

## Task History

The GitHub issue and PR are the task record. Closed issues and merged PRs hold
the history. No local sprint, plan or task archive is an active approval
prerequisite or evidence of completed work.
