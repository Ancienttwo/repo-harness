# Harness Profile Benchmark

> **Authority**: live claude provider execution
> **Generated**: 2026-07-13T01:55:46.444Z
> **Run ID**: d2a2fdcb-bda9-41af-bd46-411e5d412097
> **Source commit**: 7b11d293c3b395e874ea8047665b7589567e7964
> **Provider version**: 2.1.207 (Claude Code)
> **Hashes**: runner=sha256:1478b476f162cdabbe5f70de791797fb3a9b90afcc9cde87d8e5a547e915272d; manifest=sha256:2f44e8199fa0b33a433dcabe3aa4a84ae6166e646caaabbcfd5b424bca1a21bf; fixture=sha256:70b42af6779dc647556940abc082358314f31bc75e8ba88e0e558e58ea2ca915

| Profile | Passed | Known tokens | Avg duration ms | Task artifacts | Projection artifacts | Recovery |
|---|---:|---:|---:|---:|---:|---|
| no-harness | 9/9 | 75103 | 61708 | 0 | 0 | passed |
| adaptive-lite | 9/9 | 206900 | 109126 | 9 | 0 | passed |
| strict-harness | 9/9 | 178311 | 89049 | 4 | 18 | passed |

Projection artifacts are the pre-run profile envelope (for example Strict Plan/Contract inputs); task artifacts are files created by the provider during the measured task. Provider-owned fields remain `null` when the structured provider stream does not supply them. See the JSON report for per-run hook, guard, evidence-hash, artifact, isolation, and grader evidence.
