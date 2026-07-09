# Plan: CLI / Hook harness 与 GPT-5.6 运行时收敛

> **Status**: Approved
> **Created**: 20260710-0230
> **Slug**: think-cli-hook-harness
> **Artifact Level**: work-package
> **Contract Level**: true
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: live CLI readback, hook intent verdicts, agent-fleet parity, full required checks
> **Rollback Surface**: one bounded CLI/hook/model-profile commit with no data migration or external-state write
> **Spec**: `docs/spec.md`
> **Task Contract**: `tasks/contracts/20260710-0230-think-cli-hook-harness.contract.md`
> **Task Review**: `tasks/reviews/20260710-0230-think-cli-hook-harness.review.md`
> **Implementation Notes**: `tasks/notes/20260710-0230-think-cli-hook-harness.notes.md`

## Goal

Make the current CLI/update-check and prompt-hook paths truthful under live use, and finish the already-landed GPT-5.6 agent-fleet migration with a role-appropriate reasoning baseline.

## Agentic Routing

- Selected route: bounded main-thread implementation followed by read-only gate review.
- Routing reason: three edits share one small verification boundary; parallel writers would overlap generated/mirrored agent-fleet surfaces.
- Due diligence:
  - P1 map: `src/cli/index.ts` dispatches diagnostics; `src/cli/hook-entry.ts` and `prompt-intents.ts` own lightweight hook verdicts; `scripts/install-agent-fleet.sh` owns generated Codex role profiles.
  - P2 trace: `setup check --check-updates` reaches `readLatestPackageVersion`, which invokes Bun from `os.tmpdir()` and fails because `bun pm view` requires a package root; `UserPromptSubmit` reaches the TS classifier, where `请直接修改…并提交` misses the execution verbs and is preempted by release-review precedence.
  - P3 decision rationale: keep Bun and the deterministic local classifier; fix their narrow inputs instead of adding a package manager, networked LLM classifier, wrapper, or fallback. Preserve GPT-5.5 fast-worker effort as the GPT-5.6 migration baseline.

## Implementation

- Run the Bun registry lookup from the installed package root, retain the absolute `process.execPath` authority boundary, and add a regression probe that fails when the selected cwd lacks `package.json`.
- Recognize the bounded Chinese imperative form `请直接修改/直接修改` before release-review advisory routing; add verdict tests without broadening generic `修改` into an execution signal.
- Keep deep-reasoner and gatekeeper on `gpt-5.6-sol` + `xhigh`; keep fast-worker on `gpt-5.6-terra` but restore `medium` reasoning across generator, checked-in profile, reference mirror, and parity tests.
- Do not add Responses-API-only GPT-5.6 features (Programmatic Tool Calling, persisted reasoning, explicit cache controls, Pro mode, API multi-agent) to this CLI/hook layer. Codex 0.144 supports the model profiles but not those request fields here.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Registry lookup becomes cwd-dependent again | Resolve cwd from `import.meta.url` to the package root and make the fake Bun probe require its manifest. |
| Chinese classifier becomes over-broad | Match only the explicit `直接修改` imperative, retain question/refinement exclusions, and test both execution and advisory forms. |
| GPT-5.6 profile increases cost/latency | Preserve the previous fast-worker `medium` baseline; keep `xhigh` only for architecture and gate roles. |
| Generated copies drift | Update canonical generator, asset mirror, checked-in TOML, docs mirror, and parity tests together. |

## Promotion Gate

- **Merge/PR unit**: one CLI/hook/agent-profile correctness slice.
- **Rollback surface**: revert the slice commit; no stored data or host configuration migration.
- **Verification boundary**: live `setup check`, direct prompt verdict, model availability probes, focused tests, `bun test`, typecheck, and required repo gates.
- **Review/acceptance boundary**: review must confirm no unrelated prompt rules or API integrations were added.
- **High-risk surface**: user-level update advice and execution-gate intent classification.
- **Why not checklist row**: the slice crosses CLI diagnostics, hook policy, generated agent profiles, and full verification as one rollback unit.

## Evidence Contract

- **State/progress path**: this plan, its generated contract/review/notes, and `.ai/harness/checks/latest.json`.
- **Verification evidence**: command output from live CLI/hook probes plus focused and full test suites.
- **Evaluator rubric**: correctness, fail-closed scope, generated parity, no new dependency/file/abstraction, and no regression in the 250 ms hook-engine budget.
- **Stop condition**: both live reproductions pass, GPT-5.6 profiles load, all required checks pass, and review records no blocker.
- **Rollback surface**: revert the bounded implementation commit and regenerate no external state.

## Out of scope / Future work

- Reducing the machine-wide Codex skill/plugin context (the live probe warned that skill descriptions exceeded the 2% skills budget) because those installed plugins are not owned by this repo slice.
- Adding Responses API orchestration, prompt-cache accounting, persisted reasoning state, Pro mode, or API multi-agent execution.
- Rewriting or deduplicating the broader global/project instruction stack without a representative prompt eval.

## Task Breakdown

- [ ] Fix and test the Bun registry lookup cwd.
- [ ] Fix and test the explicit Chinese execution-intent route.
- [ ] Normalize fast-worker GPT-5.6 Terra effort to `medium` across owned mirrors.
- [ ] Run live probes, focused tests, full required checks, and read-only review.
