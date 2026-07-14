# Harness Profile Benchmark

> **Authority**: live codex provider execution
> **Generated**: 2026-07-14T12:23:54.584Z
> **Run ID**: 5829bad5-7d59-4698-913f-1eaad8a5813b
> **Benchmark subject**: sha256:88a8a1086a5ccc4c6629c1bf134b6706b3051ec1944d900f9f51d30bb445cad3
> **Source commit**: c72ed2eca7527e76bc108c19e78b111a5f753996
> **Provider version**: codex-cli 0.144.4
> **Hashes**: runner=sha256:aa320376712c7bd816f29b3b1da0a613494ece00754f524bb4ba54fe29c97ec6; scenarios=sha256:c0a52c8156a9c34ada7c161671cce3cbcb0dadbfda001223ad431a37da2be367; fixtures=sha256:70b42af6779dc647556940abc082358314f31bc75e8ba88e0e558e58ea2ca915; install=sha256:4f18c3a525417170965e7ac6c4b442e4b47127002ccce75d4369b2187bb3b0ef; provider-schema=sha256:e7a47d3db0857c9d93ee3b212640934b20aa9a006975667bc7ee04aa4be8c0e3
> **Profile bases / arms**: 3 / 27

| Profile | Passed | Known tokens | Avg duration ms | Task artifacts | Projection artifacts | Recovery |
|---|---:|---:|---:|---:|---:|---|
| no-harness | 9/9 | 612612 | 50920 | 0 | 0 | passed |
| adaptive-lite | 9/9 | 2772969 | 118634 | 5 | 0 | passed |
| strict-harness | 9/9 | 2283719 | 117057 | 10 | 18 | passed |

Projection artifacts are the pre-run profile envelope (for example Strict Plan/Contract inputs); task artifacts are files created by the provider during the measured task. Provider-owned fields remain `null` when the structured provider stream does not supply them. See the JSON report for per-run hook, guard, evidence-hash, artifact, isolation, and grader evidence.

## Artifact Files

Per-run paths backing each `artifact_files_created` count, for auditing whether they land under `plans/`, `tasks/`, or `.ai/harness/` (note: `.ai/harness/runs/` and `.ai/harness/checks/*.latest.*` are gitignored and never appear here, since this list is sourced from `git status`).

- adaptive-lite/cross-capability-feature: plans/plan-20260714-2006-shared-status-format.md, tasks/contracts/20260714-2006-shared-status-format.contract.md, tasks/notes/20260714-2006-shared-status-format.notes.md, tasks/reviews/20260714-2006-shared-status-format.review.md, tasks/todos.md
- strict-harness/cross-capability-feature: plans/plan-20260714-2016-cross-capability-feature.md, tasks/contracts/20260714-2016-cross-capability-feature.contract.md, tasks/notes/20260714-2016-cross-capability-feature.notes.md, tasks/reviews/20260714-2016-cross-capability-feature.review.md, tasks/todos.md
- strict-harness/database-migration: plans/plan-20260714-2017-add-widget-status-migration.md, tasks/contracts/20260714-2017-add-widget-status-migration.contract.md, tasks/notes/20260714-2017-add-widget-status-migration.notes.md, tasks/reviews/20260714-2017-add-widget-status-migration.review.md, tasks/todos.md
