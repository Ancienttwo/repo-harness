# Defending-code reference harness: debug evaluation extraction

## Decision

Do not vendor Anthropic's reference harness or add its proactive vulnerability-finding runtime to `/hunt`. Extract only the evaluation patterns that strengthen the existing reactive debug evidence contract: answer-key omission from the evaluated inputs, false-positive control, and fresh independent replay.

## Source examined

- Repository: [anthropics/defending-code-reference-harness](https://github.com/anthropics/defending-code-reference-harness)
- Revision: [`d3bea6b5793b5f3d59a75ebe69a58efa88383145`](https://github.com/anthropics/defending-code-reference-harness/tree/d3bea6b5793b5f3d59a75ebe69a58efa88383145)
- Relevant paths: [`README.md`](https://github.com/anthropics/defending-code-reference-harness/blob/d3bea6b5793b5f3d59a75ebe69a58efa88383145/README.md), [`targets/dnrcanary`](https://github.com/anthropics/defending-code-reference-harness/tree/d3bea6b5793b5f3d59a75ebe69a58efa88383145/targets/dnrcanary), and the grader/replay pipeline under [`harness`](https://github.com/anthropics/defending-code-reference-harness/tree/d3bea6b5793b5f3d59a75ebe69a58efa88383145/harness)

The upstream project calls itself a reference rather than a product and is not maintained as a contribution target. Its main loop searches proactively for C/C++ vulnerabilities, receives sanitizer crash evidence, performs repeated validation, and then grades a candidate in a new environment. Its canary target additionally separates ground truth from a red herring.

## Borrowed patterns

| Upstream pattern | Local implementation |
| --- | --- |
| Canary ground truth excluded from the agent-facing target | `evals/debug-hunt/scenarios.json` and fixtures are stub-visible; `ground-truth.json` is not included in the trusted callback arguments or assigned workspace. The in-process seam is not a security sandbox. |
| Independent replay after a candidate finding | `scripts/run-debug-ground-truth-eval.ts` copies the original fixture again and replays a constrained `bun test` oracle before grading the submitted diagnosis. |
| Red-herring control | `red-herring-no-bug` has a passing oracle and requires abstention; a made-up diagnosis is a typed failure. |
| Separate execution and grading evidence | Provider and grader use disjoint status enums and hashes bind the exact inputs. |

## Deliberately not borrowed

- The proactive `build → recon → find → verify → dedupe → report → patch` workflow. Local `/hunt` remains symptom-driven.
- ASAN/C++ assumptions, Docker/gVisor execution, egress controls, and hostile-target execution. V1 runs only repository-owned TypeScript/Bun fixtures.
- Upstream reporting/patch generation and its code. This profile emits only deterministic diagnostic-evaluation evidence.
- Upstream container/process isolation. V1's only CLI provider is a trusted in-process stub; arbitrary injected callbacks can access host process authority and must not be treated as untrusted providers.

## Local consequence

The profile is a regression measurement surface, not proof that `/hunt` should change. Any runtime change to Waza or `root-cause-prover` needs a separate bug or capability contract after this profile supplies baseline evidence.
