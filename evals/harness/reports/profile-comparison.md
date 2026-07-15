# Harness Profile Benchmark

> **Authority**: live codex provider execution
> **Generated**: 2026-07-15T09:38:23.278Z
> **Run ID**: c88767c6-bf6e-4425-be8b-02e275141d8b
> **Benchmark subject**: sha256:c2c55a74bcb67448451f57fa10a8c6f2fe8f195992d2969b153781ce89e0d640
> **Source commit**: 606b02c17348dfb2085575d136fae1d38ea5728d
> **Provider version**: codex-cli 0.144.4
> **Hashes**: runner=sha256:3ab4b160ee026d55741ed520504edbeb583230358574288c9c8025f3fe4a5bc4; scenarios=sha256:c0a52c8156a9c34ada7c161671cce3cbcb0dadbfda001223ad431a37da2be367; fixtures=sha256:70b42af6779dc647556940abc082358314f31bc75e8ba88e0e558e58ea2ca915; install=sha256:472bfbb9d9f99002792adae837b065821a3c4c008d91af6b655bf4713cda3726; provider-schema=sha256:e7a47d3db0857c9d93ee3b212640934b20aa9a006975667bc7ee04aa4be8c0e3
> **Profile bases / arms**: 3 / 27

| Profile | Passed | Known tokens | Avg duration ms | Task artifacts | Projection artifacts | Recovery |
|---|---:|---:|---:|---:|---:|---|
| no-harness | 9/9 | 618250 | 46576 | 0 | 0 | passed |
| adaptive-lite | 9/9 | 1851145 | 89544 | 10 | 0 | passed |
| strict-harness | 9/9 | 1974046 | 105048 | 10 | 18 | passed |

Projection artifacts are the pre-run profile envelope (for example Strict Plan/Contract inputs); task artifacts are files created by the provider during the measured task. Provider-owned fields remain `null` when the structured provider stream does not supply them. See the JSON report for per-run hook, guard, evidence-hash, artifact, isolation, and grader evidence.

## Artifact Files

Per-run paths backing each `artifact_files_created` count, for auditing whether they land under `plans/`, `tasks/`, or `.ai/harness/` (note: `.ai/harness/runs/` and `.ai/harness/checks/*.latest.*` are gitignored and never appear here, since this list is sourced from `git status`).

- adaptive-lite/cross-capability-feature: plans/plan-20260715-1724-shared-status-formatter.md, tasks/contracts/20260715-1724-shared-status-formatter.contract.md, tasks/notes/20260715-1724-shared-status-formatter.notes.md, tasks/reviews/20260715-1724-shared-status-formatter.review.md, tasks/todos.md
- adaptive-lite/database-migration: plans/plan-20260715-1725-add-widget-status-migration.md, tasks/contracts/20260715-1725-add-widget-status-migration.contract.md, tasks/notes/20260715-1725-add-widget-status-migration.notes.md, tasks/reviews/20260715-1725-add-widget-status-migration.review.md, tasks/todos.md
- strict-harness/cross-capability-feature: plans/plan-20260715-1731-benchmark.md, tasks/contracts/20260715-1731-benchmark.contract.md, tasks/notes/20260715-1731-benchmark.notes.md, tasks/reviews/20260715-1731-benchmark.review.md, tasks/todos.md
- strict-harness/database-migration: plans/plan-20260715-1732-add-widget-status.md, tasks/contracts/20260715-1732-add-widget-status.contract.md, tasks/notes/20260715-1732-add-widget-status.notes.md, tasks/reviews/20260715-1732-add-widget-status.review.md, tasks/todos.md
