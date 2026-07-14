# Harness Profile Benchmark

> **Authority**: live codex provider execution
> **Generated**: 2026-07-14T11:47:22.622Z
> **Run ID**: ffc4b742-d335-4a82-8911-338705eab4c8
> **Benchmark subject**: sha256:96b37c54479675b321e11a44711ba5c97cce82873aed79407cedfc1681a4470a
> **Source commit**: d248d1357dee67e8bd6cf90904c0d7bd313f53c2
> **Provider version**: codex-cli 0.144.4
> **Hashes**: runner=sha256:aa320376712c7bd816f29b3b1da0a613494ece00754f524bb4ba54fe29c97ec6; scenarios=sha256:c0a52c8156a9c34ada7c161671cce3cbcb0dadbfda001223ad431a37da2be367; fixtures=sha256:70b42af6779dc647556940abc082358314f31bc75e8ba88e0e558e58ea2ca915; install=sha256:b357a81eac334d8f59f5e3cafa92d6083397ed2996b8635d2dac555c10985c28; provider-schema=sha256:e7a47d3db0857c9d93ee3b212640934b20aa9a006975667bc7ee04aa4be8c0e3
> **Profile bases / arms**: 3 / 27

| Profile | Passed | Known tokens | Avg duration ms | Task artifacts | Projection artifacts | Recovery |
|---|---:|---:|---:|---:|---:|---|
| no-harness | 9/9 | 634445 | 48973 | 0 | 0 | passed |
| adaptive-lite | 9/9 | 4287662 | 146311 | 10 | 0 | passed |
| strict-harness | 9/9 | 1848480 | 107782 | 10 | 18 | passed |

Projection artifacts are the pre-run profile envelope (for example Strict Plan/Contract inputs); task artifacts are files created by the provider during the measured task. Provider-owned fields remain `null` when the structured provider stream does not supply them. See the JSON report for per-run hook, guard, evidence-hash, artifact, isolation, and grader evidence.

## Artifact Files

Per-run paths backing each `artifact_files_created` count, for auditing whether they land under `plans/`, `tasks/`, or `.ai/harness/` (note: `.ai/harness/runs/` and `.ai/harness/checks/*.latest.*` are gitignored and never appear here, since this list is sourced from `git status`).

- adaptive-lite/cross-capability-feature: plans/plan-20260714-1929-shared-status-format.md, tasks/contracts/20260714-1929-shared-status-format.contract.md, tasks/notes/20260714-1929-shared-status-format.notes.md, tasks/reviews/20260714-1929-shared-status-format.review.md, tasks/todos.md
- adaptive-lite/database-migration: plans/plan-20260714-1929-add-widget-status-migration.md, tasks/contracts/20260714-1929-add-widget-status-migration.contract.md, tasks/notes/20260714-1929-add-widget-status-migration.notes.md, tasks/reviews/20260714-1929-add-widget-status-migration.review.md, tasks/todos.md
- strict-harness/cross-capability-feature: plans/plan-20260714-1941-cross-capability-feature.md, tasks/contracts/20260714-1941-cross-capability-feature.contract.md, tasks/notes/20260714-1941-cross-capability-feature.notes.md, tasks/reviews/20260714-1941-cross-capability-feature.review.md, tasks/todos.md
- strict-harness/database-migration: plans/plan-20260714-1941-add-widget-status.md, tasks/contracts/20260714-1941-add-widget-status.contract.md, tasks/notes/20260714-1941-add-widget-status.notes.md, tasks/reviews/20260714-1941-add-widget-status.review.md, tasks/todos.md
