# Task Scope and Optional Sprint Backlogs

Ordinary work is described in its PR: goal, scope, changes, verification, risk and rollback.
The delegation brief contains only Goal, Scope, Verify and Rollback. A separate plan,
contract, review, notes file, machine block or promotion gate is not a prerequisite.
Use notes only for non-obvious decisions. PRDs are for genuinely new products; an
optional sprint backlog may coordinate dependent work without creating artifact chains.

## Risk and Review

Normal changes use typecheck and affected tests. Large changes, security/permissions,
or unresolved model uncertainty trigger gatekeeper/cross-model review on demand.
Only main publication, deletion, credentials/permissions and release/production are
hard boundaries; the latter two require user approval. Reviewers consume existing results.

## Testing Policy and Artifact Standards

[AGENTS.md](../../AGENTS.md#testing) is the repo's testing policy: verify changed
behavior once, run full coverage daily, open repair tasks for failures, and report gaps.
Record actual commands and outcomes in the PR; do not require receipts, waivers or pre-fix logs.

## Existing Sprint Data

When operating an existing schema-2 sprint, preserve each row's persisted `ID` across
renames/reordering; display text is not identity. Existing stores remain their own runtime
source of truth. Historic task artifacts are snapshots under `plans/archive/` and
`tasks/archive/`, not active approval prerequisites or evidence of completed work.
