# Harness Profile Benchmark

> **Authority**: live claude provider execution
> **Generated**: 2026-07-12T23:00:49.230Z
> **Run ID**: 0fadcb29-ae98-4082-8525-f62d3d2670cd
> **Source commit**: 2061e6d152fe7639ffeebaad88c4230943330048
> **Provider version**: 2.1.207 (Claude Code)
> **Hashes**: runner=sha256:1478b476f162cdabbe5f70de791797fb3a9b90afcc9cde87d8e5a547e915272d; manifest=sha256:f15a01550972380aa45a69e91452f1401be99847da8aa959c50548c6ba63aed7; fixture=sha256:70b42af6779dc647556940abc082358314f31bc75e8ba88e0e558e58ea2ca915

| Profile | Passed | Known tokens | Avg duration ms | Task artifacts | Projection artifacts | Recovery |
|---|---:|---:|---:|---:|---:|---|
| no-harness | 9/9 | 44302 | 23839 | 0 | 0 | passed |
| adaptive-lite | 9/9 | 130685 | 55571 | 10 | 0 | passed |
| strict-harness | 9/9 | 94785 | 40013 | 0 | 18 | passed |

Projection artifacts are the pre-run profile envelope (for example Strict Plan/Contract inputs); task artifacts are files created by the provider during the measured task. Provider-owned fields remain `null` when the structured provider stream does not supply them. See the JSON report for per-run hook, guard, evidence-hash, artifact, isolation, and grader evidence.
