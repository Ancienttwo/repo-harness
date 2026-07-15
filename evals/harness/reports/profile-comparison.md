# Harness Profile Benchmark

> **Authority**: live codex provider execution
> **Generated**: 2026-07-15T07:24:33.799Z
> **Run ID**: 7b25cfd1-b0a6-4ff3-835d-bc2f3ef95940
> **Benchmark subject**: sha256:f7f7cebdb595359aff5a0639e490376bf1e7f8aa452b1d3284072304ce70be0b
> **Source commit**: 26dd6e88ea7c5fcf1a80439044283e98d892da41
> **Provider version**: codex-cli 0.144.4
> **Hashes**: runner=sha256:aa320376712c7bd816f29b3b1da0a613494ece00754f524bb4ba54fe29c97ec6; scenarios=sha256:c0a52c8156a9c34ada7c161671cce3cbcb0dadbfda001223ad431a37da2be367; fixtures=sha256:70b42af6779dc647556940abc082358314f31bc75e8ba88e0e558e58ea2ca915; install=sha256:472bfbb9d9f99002792adae837b065821a3c4c008d91af6b655bf4713cda3726; provider-schema=sha256:e7a47d3db0857c9d93ee3b212640934b20aa9a006975667bc7ee04aa4be8c0e3
> **Profile bases / arms**: 3 / 27

| Profile | Passed | Known tokens | Avg duration ms | Task artifacts | Projection artifacts | Recovery |
|---|---:|---:|---:|---:|---:|---|
| no-harness | 9/9 | 630996 | 44238 | 0 | 0 | passed |
| adaptive-lite | 9/9 | 2768825 | 103135 | 5 | 0 | passed |
| strict-harness | 9/9 | 1940880 | 94995 | 10 | 18 | passed |

Projection artifacts are the pre-run profile envelope (for example Strict Plan/Contract inputs); task artifacts are files created by the provider during the measured task. Provider-owned fields remain `null` when the structured provider stream does not supply them. See the JSON report for per-run hook, guard, evidence-hash, artifact, isolation, and grader evidence.

## Artifact Files

Per-run paths backing each `artifact_files_created` count, for auditing whether they land under `plans/`, `tasks/`, or `.ai/harness/` (note: `.ai/harness/runs/` and `.ai/harness/checks/*.latest.*` are gitignored and never appear here, since this list is sourced from `git status`).

- adaptive-lite/cross-capability-feature: plans/plan-20260715-1510-status-format.md, tasks/contracts/20260715-1510-status-format.contract.md, tasks/notes/20260715-1510-status-format.notes.md, tasks/reviews/20260715-1510-status-format.review.md, tasks/todos.md
- strict-harness/cross-capability-feature: plans/plan-20260715-1518-cross-capability-feature.md, tasks/contracts/20260715-1518-cross-capability-feature.contract.md, tasks/notes/20260715-1518-cross-capability-feature.notes.md, tasks/reviews/20260715-1518-cross-capability-feature.review.md, tasks/todos.md
- strict-harness/database-migration: plans/plan-20260715-1519-add-widget-status-migration.md, tasks/contracts/20260715-1519-add-widget-status-migration.contract.md, tasks/notes/20260715-1519-add-widget-status-migration.notes.md, tasks/reviews/20260715-1519-add-widget-status-migration.review.md, tasks/todos.md
