# Harness Profile Benchmark

> **Authority**: live claude provider execution
> **Generated**: 2026-07-13T07:02:56.407Z
> **Run ID**: f6684c28-82a1-48a0-a005-87bcff1cb53c
> **Source commit**: 900854ff31a5dfc76935f2d924a28eaf5c7dbf53
> **Provider version**: 2.1.207 (Claude Code)
> **Hashes**: runner=sha256:95a35b64496c7a1df23860cd2c5e1071a4c7baf26b6b1a8e2b15055ef08deaca; manifest=sha256:2f44e8199fa0b33a433dcabe3aa4a84ae6166e646caaabbcfd5b424bca1a21bf; fixture=sha256:70b42af6779dc647556940abc082358314f31bc75e8ba88e0e558e58ea2ca915

| Profile | Passed | Known tokens | Avg duration ms | Task artifacts | Projection artifacts | Recovery |
|---|---:|---:|---:|---:|---:|---|
| no-harness | 9/9 | 67905 | 48839 | 1 | 0 | passed |
| adaptive-lite | 9/9 | 163539 | 95389 | 10 | 0 | passed |
| strict-harness | 9/9 | 128633 | 54779 | 2 | 18 | passed |

Projection artifacts are the pre-run profile envelope (for example Strict Plan/Contract inputs); task artifacts are files created by the provider during the measured task. Provider-owned fields remain `null` when the structured provider stream does not supply them. See the JSON report for per-run hook, guard, evidence-hash, artifact, isolation, and grader evidence.

## Artifact Files

Per-run paths backing each `artifact_files_created` count, for auditing whether they land under `plans/`, `tasks/`, or `.ai/harness/` (note: `.ai/harness/runs/` and `.ai/harness/checks/*.latest.*` are gitignored and never appear here, since this list is sourced from `git status`).

- no-harness/cross-capability-feature: tasks/todo.md
- adaptive-lite/cross-capability-feature: tasks/current.md, plans/plan-20260713-1437-shared-status-formatter.md, tasks/contracts/20260713-1437-shared-status-formatter.contract.md, tasks/notes/20260713-1437-shared-status-formatter.notes.md, tasks/reviews/20260713-1437-shared-status-formatter.review.md
- adaptive-lite/database-migration: tasks/todos.md, plans/plan-20260713-1443-add-widget-status.md, tasks/contracts/20260713-1443-add-widget-status.contract.md, tasks/notes/20260713-1443-add-widget-status.notes.md, tasks/reviews/20260713-1443-add-widget-status.review.md
- strict-harness/cross-capability-feature: tasks/contracts/20000101-0000-benchmark.contract.md, tasks/notes/20000101-0000-benchmark.notes.md
