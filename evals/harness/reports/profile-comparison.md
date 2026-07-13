# Harness Profile Benchmark

> **Authority**: live claude provider execution
> **Generated**: 2026-07-13T15:00:50.371Z
> **Run ID**: 02b23ab9-5546-402f-8d08-73477c1b8e95
> **Source commit**: 242e1f50d1e26d08230babb4314ffa77d3384068
> **Provider version**: 2.1.207 (Claude Code)
> **Hashes**: runner=sha256:10b74a69c0da30868b0a54ab8fc845d323ddd74e2a4f16f94240166624d8c0db; manifest=sha256:c0a52c8156a9c34ada7c161671cce3cbcb0dadbfda001223ad431a37da2be367; fixture=sha256:70b42af6779dc647556940abc082358314f31bc75e8ba88e0e558e58ea2ca915

| Profile | Passed | Known tokens | Avg duration ms | Task artifacts | Projection artifacts | Recovery |
|---|---:|---:|---:|---:|---:|---|
| no-harness | 9/9 | 63816 | 49083 | 0 | 0 | passed |
| adaptive-lite | 9/9 | 101386 | 61718 | 10 | 0 | passed |
| strict-harness | 9/9 | 113416 | 52708 | 0 | 18 | passed |

Projection artifacts are the pre-run profile envelope (for example Strict Plan/Contract inputs); task artifacts are files created by the provider during the measured task. Provider-owned fields remain `null` when the structured provider stream does not supply them. See the JSON report for per-run hook, guard, evidence-hash, artifact, isolation, and grader evidence.
