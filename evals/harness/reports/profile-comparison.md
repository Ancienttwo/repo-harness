# Harness Profile Benchmark

> **Authority**: live claude provider execution
> **Generated**: 2026-07-13T17:39:47.273Z
> **Run ID**: abfc38f1-e8d3-4c38-a13d-0dc90d8164ca
> **Source commit**: a907c3350bce999dbf850bc83aa763604ffbf666
> **Provider version**: 2.1.207 (Claude Code)
> **Hashes**: runner=sha256:10b74a69c0da30868b0a54ab8fc845d323ddd74e2a4f16f94240166624d8c0db; manifest=sha256:c0a52c8156a9c34ada7c161671cce3cbcb0dadbfda001223ad431a37da2be367; fixture=sha256:70b42af6779dc647556940abc082358314f31bc75e8ba88e0e558e58ea2ca915

| Profile | Passed | Known tokens | Avg duration ms | Task artifacts | Projection artifacts | Recovery |
|---|---:|---:|---:|---:|---:|---|
| no-harness | 9/9 | 65363 | 44304 | 0 | 0 | passed |
| adaptive-lite | 9/9 | 119512 | 73288 | 10 | 0 | passed |
| strict-harness | 9/9 | 106205 | 50324 | 0 | 18 | passed |

Projection artifacts are the pre-run profile envelope (for example Strict Plan/Contract inputs); task artifacts are files created by the provider during the measured task. Provider-owned fields remain `null` when the structured provider stream does not supply them. See the JSON report for per-run hook, guard, evidence-hash, artifact, isolation, and grader evidence.
