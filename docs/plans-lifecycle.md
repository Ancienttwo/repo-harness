# Plans lifecycle

Use four buckets. Do not add a fifth directory tree for task tracking.

| Bucket | Authority | Lifecycle |
| --- | --- | --- |
| intent | `plans/` | Keep open designs that span multiple PRs. Remove expired live pages. Tag useful development history `archive(=git)` and log noise `delete` in the PR inventory. Both leave the live tree; git history is the archive. Do not create or use `plans/archive/`. Keep uncertain plans until the owner resolves their status. |
| work | GitHub Issue and PR | Track scope, ownership, deferred work and completion here. `tasks/todos.md` is historical and frozen. |
| proof | PR body, CI and seat-local evidence | Record verification and review in the PR. Do not generate `tasks/notes/`, `tasks/reviews/` or example task layouts. |
| lesson | `tasks/lessons.md` | Read active lessons at session start. Keep correction rules here; do not move them to `docs/lessons.md`. |

The policy and its generators change together. `assets/workflow-contract.v1.json`
owns adoption paths. The adoption planner and init scripts project those paths.
`new-plan.sh` creates planning content. `archive-workflow.sh` no longer reads or
rewrites todos, notes or review files. `maintenance-triage.sh` still reads lessons.
Existing contract generation, binding receipts and parsers remain in place.
Their removal is #1114 and is on HOLD. This cleanup does not invoke the legacy
plan/contract archive command or migrate deleted plans into an archive tree.

## Downstream migration

About 14 repositories adopt the workflow contract. This source change does not
update their installed projections. The operator migrates one selected local
checkout at a time. Nothing scans the fleet in CI or touches a remote.

1. `repo-harness upgrade --scope project --json` lists the #986 legacy inventory.
   The `retired-task-artifact-surfaces` action covers `tasks/notes/.gitkeep`,
   `tasks/reviews/.gitkeep`, `.claude/templates/{review,implementation-notes}.template.md`
   and an unedited deferred-goal ledger at `tasks/todos.md`.
2. `repo-harness upgrade --scope project --apply` backs up and removes only
   files whose bytes match a shipped fingerprint. Edited or unknown files stay
   as `report` items. `repo-harness upgrade decide --keep <path>` records a keep.
3. `repo-harness init` refreshes `.ai/harness/workflow-contract.json`; the new
   projection has no `deferredGoalLedger`.

`tasks/contracts/` and `contract.template.md` stay until #1114. Preserve
`lessonsLog` at `tasks/lessons.md`. Freeze an edited todos file with a historical
banner; do not convert its checkboxes automatically. Record real remaining work
in Issues.

Verify a fresh init and an upgrade: lessons and contracts remain available;
notes/reviews/example task layouts and todos are not generated. Run archive with
a historical todos file and confirm its bytes do not change. Review each repo's
diff in its own PR. Do not add a runtime fallback for retired contract fields.
