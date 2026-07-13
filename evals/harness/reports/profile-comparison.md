# Harness Profile Benchmark

> **Authority**: live claude provider execution
> **Generated**: 2026-07-13T00:02:01.907Z
> **Run ID**: 04a5e4b3-ba68-475e-b84a-ad6262179c5d
> **Source commit**: 09df83862b71a3667f460ad03e0bd89af893c486
> **Provider version**: 2.1.207 (Claude Code)
> **Hashes**: runner=sha256:1478b476f162cdabbe5f70de791797fb3a9b90afcc9cde87d8e5a547e915272d; manifest=sha256:f15a01550972380aa45a69e91452f1401be99847da8aa959c50548c6ba63aed7; fixture=sha256:70b42af6779dc647556940abc082358314f31bc75e8ba88e0e558e58ea2ca915

| Profile | Passed | Known tokens | Avg duration ms | Task artifacts | Projection artifacts | Recovery |
|---|---:|---:|---:|---:|---:|---|
| no-harness | 9/9 | 44883 | 23908 | 0 | 0 | passed |
| adaptive-lite | 9/9 | 99414 | 57479 | 10 | 0 | passed |
| strict-harness | 9/9 | 83396 | 39310 | 0 | 18 | passed |

Projection artifacts are the pre-run profile envelope (for example Strict Plan/Contract inputs); task artifacts are files created by the provider during the measured task. Provider-owned fields remain `null` when the structured provider stream does not supply them. See the JSON report for per-run hook, guard, evidence-hash, artifact, isolation, and grader evidence.
