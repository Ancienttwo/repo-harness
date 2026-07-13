# Harness Profile Benchmark

> **Authority**: live claude provider execution
> **Generated**: 2026-07-13T11:02:22.433Z
> **Run ID**: 7f4db5f6-d981-4896-9361-fedd16fe31da
> **Source commit**: 3e81dd580695cf1e8c7ed2be6ebfd46d80b31ea3
> **Provider version**: 2.1.207 (Claude Code)
> **Hashes**: runner=sha256:10b74a69c0da30868b0a54ab8fc845d323ddd74e2a4f16f94240166624d8c0db; manifest=sha256:2f44e8199fa0b33a433dcabe3aa4a84ae6166e646caaabbcfd5b424bca1a21bf; fixture=sha256:70b42af6779dc647556940abc082358314f31bc75e8ba88e0e558e58ea2ca915

| Profile | Passed | Known tokens | Avg duration ms | Task artifacts | Projection artifacts | Recovery |
|---|---:|---:|---:|---:|---:|---|
| no-harness | 9/9 | 67748 | 47827 | 0 | 0 | passed |
| adaptive-lite | 9/9 | 217596 | 127119 | 10 | 0 | passed |
| strict-harness | 9/9 | 126625 | 56069 | 3 | 18 | passed |

Projection artifacts are the pre-run profile envelope (for example Strict Plan/Contract inputs); task artifacts are files created by the provider during the measured task. Provider-owned fields remain `null` when the structured provider stream does not supply them. See the JSON report for per-run hook, guard, evidence-hash, artifact, isolation, and grader evidence.
