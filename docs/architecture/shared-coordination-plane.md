# Historical Coordination and Worktree Safety

> Current boundary: #773 slice C, 2026-10-18.

The GitHub issue and PR own current task identity, claim, status and dependency.
The local coordination files remain historical inputs for operator views.
No Sprint CLI, completion writer, lease cleanup writer or publication lifecycle writer remains.

## P1: Boundaries

| Boundary | Owner | Current use |
| --- | --- | --- |
| Historical row and owner schema | `src/core/state/coordination-identity.ts` | Read persisted task IDs and validate owner records. |
| Historical lease files | `src/effects/state/coordination-lease-store.ts` | Read exact owner bytes. Hold task locks for manual inbox and feedback operations. |
| Board | `src/effects/state/collect-board-inputs.ts`, `src/effects/state/resolve-board.ts`, `src/core/state/project-board.ts` | Read canonical rows, leases, topology and progress. |
| Hook slice | `src/effects/state/collect-slice-inputs.ts`, `src/core/state/project-board-slice.ts` | Report the historical owner and peer rows. |
| Historical claim token | `src/effects/state/coordination-claim-token.ts` | Locate the hook slice's own row. |
| Worktree safety | `src/effects/state/coordination-worktree-topology.ts` | Start, inspect and remove exact worktrees under topology and marker guards. Leases are not read (#917). |

These files remain in `capability.workflow-engine.workflow-state` and its
`component.workflow-state.coordination-plane` component. The component name is
Historical Coordination and Worktree Safety.

## P2: Read and cleanup paths

`repo-harness state board --json` reads the selected canonical Sprint, historical
lease bytes, Git worktree topology and each owner's progress. It collects,
projects and collects again. A changed revision triggers one retry. A second
change returns `changed_during_read`.

Hook context reads the same identity and ownership schema. It does not run
completion commands. Board and hook slice JSON contain no `actions` field.
The manual inbox and Herdr endpoint still use their existing delivery checks.
A board observation cannot authorize a task claim or transfer ownership.

`contract-worktree start`, `cleanup`, `sweep` and `status` remain available.
Cleanup requires exact merge proof and the current worktree identity. Dirty,
locked, marked or unknown worktrees remain protected. Provider merge
proof supplements the local merge test. Architecture daemons and recorded
runtime close before checkout deletion.

`ship-worktrees` ships a branch PR. Its journal records operation progress,
not task authority. It keeps frozen-head checks, provider readback and explicit
branch recovery. Local merge and contract finish/recover paths are removed.
A historical lease-mode journal can be aborted before its push lands. The same
branch, HEAD and dirty-work checks still apply. Reconcile for that retired mode
returns the journal path for manual handling.

## P3: Invariants

- A persisted row ID is identity. A title, row number or path is not a replacement ID.
- Task revisions bind the task definition. A sibling row's status change does not change identity.
- Unknown or malformed owner bytes remain unknown. Readers do not repair or delete them.
- Evidence failure cannot transfer the historical owner or change its generation.
- The board is a read model. Torn reads stay visible to the caller.
- Historical lease files have no automatic migration or cleanup writer. No reader of liveness files remains (#917).
- Worktree removal preserves its existing locks, identity checks and deletion fences.

## Verification surfaces

`tests/coordination-identity.test.ts` covers record identity and validation.
`tests/coordination-lease-store.test.ts` covers readers, locks and exact worktree cleanup.
`tests/sprint-claim-concurrency.test.ts` covers historical reads across real worktrees.
`tests/board-projection.test.ts`, `tests/board-snapshot-consistency.test.ts` and
`tests/board-slice.test.ts` cover the read models.
The Herdr wake runtime keeps its separate 47-case suite.
