# Harness Profile Benchmark

> **Authority**: live codex provider execution
> **Generated**: 2026-07-21T22:28:42.385Z
> **Run ID**: 354e675b-00fa-41a8-8039-0fb2661386d3
> **Benchmark subject**: sha256:32c6e96e2e2e1880b587d5f1073819c7ec7f00acf957c4368edd1d2d6eea01da
> **Source commit**: b32b328208da5b07418c4fd815491bcc3913ff9f
> **Provider version**: codex-cli 0.144.5
> **Hashes**: runner=sha256:a2c2ddf0b387fea37519edd9b793bd741128f0645c264e77caa802be3a1eaeb5; scenarios=sha256:c0a52c8156a9c34ada7c161671cce3cbcb0dadbfda001223ad431a37da2be367; fixtures=sha256:70b42af6779dc647556940abc082358314f31bc75e8ba88e0e558e58ea2ca915; install=sha256:78e2ee59f45ec3f774f15eb916cf5954acfbc489bf925d2785ca633585999194; provider-schema=sha256:e7a47d3db0857c9d93ee3b212640934b20aa9a006975667bc7ee04aa4be8c0e3
> **Profile bases / arms**: 3 / 27

| Profile | Passed | Known tokens | Avg duration ms | Task artifacts | Projection artifacts | Recovery |
|---|---:|---:|---:|---:|---:|---|
| no-harness | 9/9 | 535060 | 32299 | 0 | 0 | passed |
| adaptive-lite | 9/9 | 1775916 | 63518 | 6 | 0 | passed |
| strict-harness | 9/9 | 2502266 | 80530 | 12 | 18 | passed |

Projection artifacts are the pre-run profile envelope (for example Strict Plan/Contract inputs); task artifacts are files created by the provider during the measured task. Provider-owned fields remain `null` when the structured provider stream does not supply them. See the JSON report for per-run hook, guard, evidence-hash, artifact, isolation, and grader evidence.

## Artifact Files

Per-run paths backing each `artifact_files_created` count, for auditing whether they land under `plans/`, `tasks/`, or `.ai/harness/` (note: `.ai/harness/runs/` and `.ai/harness/checks/*.latest.*` are gitignored and never appear here, since this list is sourced from `git status`).

- adaptive-lite/cross-capability-feature: .ai/harness/policy.json, plans/plan-20260722-0618-shared-status-formatter.md, tasks/contracts/20260722-0618-shared-status-formatter.contract.md, tasks/notes/20260722-0618-shared-status-formatter.notes.md, tasks/reviews/20260722-0618-shared-status-formatter.review.md, tasks/todos.md
- strict-harness/cross-capability-feature: .ai/harness/policy.json, plans/plan-20260722-0623-shared-status-formatter.md, tasks/contracts/20260722-0623-shared-status-formatter.contract.md, tasks/notes/20260722-0623-shared-status-formatter.notes.md, tasks/reviews/20260722-0623-shared-status-formatter.review.md, tasks/todos.md
- strict-harness/database-migration: .ai/harness/policy.json, plans/plan-20260722-0624-add-widget-status.md, tasks/contracts/20260722-0624-add-widget-status.contract.md, tasks/notes/20260722-0624-add-widget-status.notes.md, tasks/reviews/20260722-0624-add-widget-status.review.md, tasks/todos.md
