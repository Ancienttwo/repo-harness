# Harness Profile Benchmark

> **Authority**: live claude provider execution
> **Generated**: 2026-07-13T16:33:57.525Z
> **Run ID**: d228281c-8e72-412b-8199-dcc3a11e9060
> **Source commit**: d6cf112606de29f9a1c9b07e61f2f851965ad6d9
> **Provider version**: 2.1.207 (Claude Code)
> **Hashes**: runner=sha256:10b74a69c0da30868b0a54ab8fc845d323ddd74e2a4f16f94240166624d8c0db; manifest=sha256:c0a52c8156a9c34ada7c161671cce3cbcb0dadbfda001223ad431a37da2be367; fixture=sha256:70b42af6779dc647556940abc082358314f31bc75e8ba88e0e558e58ea2ca915

| Profile | Passed | Known tokens | Avg duration ms | Task artifacts | Projection artifacts | Recovery |
|---|---:|---:|---:|---:|---:|---|
| no-harness | 9/9 | 62312 | 44662 | 0 | 0 | passed |
| adaptive-lite | 9/9 | 109721 | 62665 | 10 | 0 | passed |
| strict-harness | 9/9 | 97503 | 44065 | 0 | 18 | passed |

Projection artifacts are the pre-run profile envelope (for example Strict Plan/Contract inputs); task artifacts are files created by the provider during the measured task. Provider-owned fields remain `null` when the structured provider stream does not supply them. See the JSON report for per-run hook, guard, evidence-hash, artifact, isolation, and grader evidence.
