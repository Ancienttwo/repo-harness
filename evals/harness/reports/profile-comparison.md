# Harness Profile Benchmark

> **Authority**: live claude provider execution
> **Generated**: 2026-07-13T15:43:40.148Z
> **Run ID**: 43651986-e956-43a5-b9f0-6398c08f56d4
> **Source commit**: eec0d61d5ebef80226bee9d301f89883c7618c6e
> **Provider version**: 2.1.207 (Claude Code)
> **Hashes**: runner=sha256:10b74a69c0da30868b0a54ab8fc845d323ddd74e2a4f16f94240166624d8c0db; manifest=sha256:c0a52c8156a9c34ada7c161671cce3cbcb0dadbfda001223ad431a37da2be367; fixture=sha256:70b42af6779dc647556940abc082358314f31bc75e8ba88e0e558e58ea2ca915

| Profile | Passed | Known tokens | Avg duration ms | Task artifacts | Projection artifacts | Recovery |
|---|---:|---:|---:|---:|---:|---|
| no-harness | 9/9 | 62618 | 42916 | 0 | 0 | passed |
| adaptive-lite | 9/9 | 126290 | 61329 | 10 | 0 | passed |
| strict-harness | 9/9 | 108549 | 52010 | 0 | 18 | passed |

Projection artifacts are the pre-run profile envelope (for example Strict Plan/Contract inputs); task artifacts are files created by the provider during the measured task. Provider-owned fields remain `null` when the structured provider stream does not supply them. See the JSON report for per-run hook, guard, evidence-hash, artifact, isolation, and grader evidence.
