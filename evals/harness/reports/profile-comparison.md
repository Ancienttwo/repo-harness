# Harness Profile Benchmark

> **Authority**: live claude provider execution
> **Generated**: 2026-07-13T04:51:27.344Z
> **Run ID**: 514fe7bc-21eb-4d88-bdbb-695b0c6a5d9d
> **Source commit**: 12e44fa343c1ae1f18056e0c66db322c548cb132
> **Provider version**: 2.1.207 (Claude Code)
> **Hashes**: runner=sha256:10b74a69c0da30868b0a54ab8fc845d323ddd74e2a4f16f94240166624d8c0db; manifest=sha256:2f44e8199fa0b33a433dcabe3aa4a84ae6166e646caaabbcfd5b424bca1a21bf; fixture=sha256:70b42af6779dc647556940abc082358314f31bc75e8ba88e0e558e58ea2ca915

| Profile | Passed | Known tokens | Avg duration ms | Task artifacts | Projection artifacts | Recovery |
|---|---:|---:|---:|---:|---:|---|
| no-harness | 9/9 | 76439 | 51693 | 0 | 0 | passed |
| adaptive-lite | 9/9 | 169904 | 81839 | 10 | 0 | passed |
| strict-harness | 9/9 | 166734 | 70541 | 4 | 18 | passed |

Projection artifacts are the pre-run profile envelope (for example Strict Plan/Contract inputs); task artifacts are files created by the provider during the measured task. Provider-owned fields remain `null` when the structured provider stream does not supply them. See the JSON report for per-run hook, guard, evidence-hash, artifact, isolation, and grader evidence.
