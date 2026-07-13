# Harness Profile Benchmark

> **Authority**: live claude provider execution
> **Generated**: 2026-07-13T10:00:28.310Z
> **Run ID**: 869b58b7-7c93-41ec-9b2b-6239e4d87688
> **Source commit**: 6ce02699cedcc642b1cde830994e4645371038ea
> **Provider version**: 2.1.207 (Claude Code)
> **Hashes**: runner=sha256:10b74a69c0da30868b0a54ab8fc845d323ddd74e2a4f16f94240166624d8c0db; manifest=sha256:2f44e8199fa0b33a433dcabe3aa4a84ae6166e646caaabbcfd5b424bca1a21bf; fixture=sha256:70b42af6779dc647556940abc082358314f31bc75e8ba88e0e558e58ea2ca915

| Profile | Passed | Known tokens | Avg duration ms | Task artifacts | Projection artifacts | Recovery |
|---|---:|---:|---:|---:|---:|---|
| no-harness | 9/9 | 66518 | 43320 | 0 | 0 | passed |
| adaptive-lite | 9/9 | 188885 | 101456 | 10 | 0 | passed |
| strict-harness | 9/9 | 127719 | 65503 | 4 | 18 | passed |

Projection artifacts are the pre-run profile envelope (for example Strict Plan/Contract inputs); task artifacts are files created by the provider during the measured task. Provider-owned fields remain `null` when the structured provider stream does not supply them. See the JSON report for per-run hook, guard, evidence-hash, artifact, isolation, and grader evidence.
