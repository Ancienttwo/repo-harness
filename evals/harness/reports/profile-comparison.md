# Harness Profile Benchmark

> **Authority**: live claude provider execution
> **Generated**: 2026-07-14T01:05:09.281Z
> **Run ID**: ad5ada9c-3ba2-4ddb-84eb-a621238ab3ad
> **Benchmark subject**: sha256:afade5953018778733f3395cb8f22fa59365f9938db8393ea984f285afd9d232
> **Source commit**: a1372fb2dbc9102da6db60c7c9e556411b0277bb
> **Provider version**: 2.1.207 (Claude Code)
> **Hashes**: runner=sha256:7ca30f5c53a2918967f45dbc2aecf5a6ceb2370893ff01a059cf9b9330a9e1c2; scenarios=sha256:c0a52c8156a9c34ada7c161671cce3cbcb0dadbfda001223ad431a37da2be367; fixtures=sha256:70b42af6779dc647556940abc082358314f31bc75e8ba88e0e558e58ea2ca915; install=sha256:f666a328c4ec5e05067610f28c52507ec078e948902f52803c2d3eb37974cb91; provider-schema=sha256:e7a47d3db0857c9d93ee3b212640934b20aa9a006975667bc7ee04aa4be8c0e3
> **Profile bases / arms**: 3 / 27

| Profile | Passed | Known tokens | Avg duration ms | Task artifacts | Projection artifacts | Recovery |
|---|---:|---:|---:|---:|---:|---|
| no-harness | 9/9 | 60039 | 41652 | 0 | 0 | passed |
| adaptive-lite | 9/9 | 192015 | 119782 | 12 | 0 | passed |
| strict-harness | 9/9 | 203410 | 124405 | 10 | 18 | passed |

Projection artifacts are the pre-run profile envelope (for example Strict Plan/Contract inputs); task artifacts are files created by the provider during the measured task. Provider-owned fields remain `null` when the structured provider stream does not supply them. See the JSON report for per-run hook, guard, evidence-hash, artifact, isolation, and grader evidence.

## Artifact Files

Per-run paths backing each `artifact_files_created` count, for auditing whether they land under `plans/`, `tasks/`, or `.ai/harness/` (note: `.ai/harness/runs/` and `.ai/harness/checks/*.latest.*` are gitignored and never appear here, since this list is sourced from `git status`).

- adaptive-lite/cross-capability-feature: plans/plan-20260714-0844-status-format-shared.md, plans/prds/.gitkeep, plans/sprints/.gitkeep, tasks/contracts/20260714-0844-status-format-shared.contract.md, tasks/notes/20260714-0844-status-format-shared.notes.md, tasks/reviews/20260714-0844-status-format-shared.review.md, tasks/todos.md
- adaptive-lite/database-migration: plans/plan-20260714-0844-add-widget-status.md, tasks/contracts/20260714-0844-add-widget-status.contract.md, tasks/notes/20260714-0844-add-widget-status.notes.md, tasks/reviews/20260714-0844-add-widget-status.review.md, tasks/todos.md
- strict-harness/cross-capability-feature: plans/plan-20000101-0000-benchmark.md, tasks/contracts/20000101-0000-benchmark.contract.md, tasks/current.md, tasks/notes/20000101-0000-benchmark.notes.md, tasks/reviews/20000101-0000-benchmark.review.md
- strict-harness/database-migration: plans/plan-20260714-0854-add-widget-status.md, tasks/contracts/20260714-0854-add-widget-status.contract.md, tasks/notes/20260714-0854-add-widget-status.notes.md, tasks/reviews/20260714-0854-add-widget-status.review.md, tasks/todos.md
