# Plan: Harness Kernel Optimization Phase 2

> **Status**: Executing
> **Created**: 20260713-1202
> **Slug**: harness-kernel-optimization-phase2
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Each phase gates on repo required checks plus its own accept gate; Phases A/B regate on a live rerun of the authoritative 3x9 profile benchmark matrix
> **Rollback Surface**: Per-phase commit reverts; hook edits keep sync:hooks/check:hooks parity; facade retirement is a fail-closed one-shot reversible via owner-marker reinstall; benchmark reruns are evidence-only
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260713-1202-harness-kernel-optimization-phase2.contract.md`
> **Task Review**: `tasks/reviews/20260713-1202-harness-kernel-optimization-phase2.review.md`
> **Implementation Notes**: `tasks/notes/20260713-1202-harness-kernel-optimization-phase2.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from waza-think planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260713-1202-harness-kernel-optimization-phase2.md`
- Sprint contract: `tasks/contracts/20260713-1202-harness-kernel-optimization-phase2.contract.md`
- Sprint review: `tasks/reviews/20260713-1202-harness-kernel-optimization-phase2.review.md`
- Implementation notes: `tasks/notes/20260713-1202-harness-kernel-optimization-phase2.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260713-1202-harness-kernel-optimization-phase2.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260713-1202-harness-kernel-optimization-phase2.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260713-1202-harness-kernel-optimization-phase2.md`.

## Approach
### Strategy
Use the captured planning output below as the execution source of truth.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| See captured planning output | Follow | Implement only the approved scope named below |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260713-1202-harness-kernel-optimization-phase2.contract.md`
- Review file: `tasks/reviews/20260713-1202-harness-kernel-optimization-phase2.review.md`
- Implementation notes file: `tasks/notes/20260713-1202-harness-kernel-optimization-phase2.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260713-1202-harness-kernel-optimization-phase2.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260713-1202-harness-kernel-optimization-phase2.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Per-phase commit reverts; hook edits keep sync:hooks/check:hooks parity; facade retirement is a fail-closed one-shot reversible via owner-marker reinstall; benchmark reruns are evidence-only
- **Verification boundary**: Each phase gates on repo required checks plus its own accept gate; Phases A/B regate on a live rerun of the authoritative 3x9 profile benchmark matrix
- **Review/acceptance boundary**: `tasks/reviews/20260713-1202-harness-kernel-optimization-phase2.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260713-1202-harness-kernel-optimization-phase2.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260713-1202-harness-kernel-optimization-phase2.contract.md`, `tasks/reviews/20260713-1202-harness-kernel-optimization-phase2.review.md`, and `tasks/notes/20260713-1202-harness-kernel-optimization-phase2.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260713-1202-harness-kernel-optimization-phase2.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Per-phase commit reverts; hook edits keep sync:hooks/check:hooks parity; facade retirement is a fail-closed one-shot reversible via owner-marker reinstall; benchmark reruns are evidence-only

## Captured Planning Output

# Harness Kernel Optimization Phase 2

> **Predecessor**: `plans/plan-20260712-2327-harness-kernel-reduction.md` (phase 1, WP1-8 landed, WP9 closeout)
> **Planning source**: deep-reasoner draft at max effort, adjudicated by orchestrator. Cross-model (GPT) review incorporated 2026-07-13: the apply_patch batch-scope bypass it flagged was verified by live reproduction and is now Phase A1; capability-registry and surface-counting hardening are Phase C.
> **Spec**: `docs/spec.md`

## Goal

Convert phase-1's landed kernel from "measured but not yet optimized" to "measurably cheaper," honoring the phase-1 closeout mandate at `docs/architecture/modules/verification/evals-checks.md:89-92`: optimize cold hook execution and Standard/Strict promotion cost before claiming a performance win; do not lower deterministic risk floors. Added by cross-model review: close a verified correctness gap where the risk floor never sees the full pending write scope of a batched `apply_patch`. Secondary: converge the over-broad Skill discovery surface (20 installed host skill dirs) toward the root SKILL.md five-action face, and close phase-1 debt items.

## Scope / Non-Scope

**In scope**
- Fix the verified `apply_patch` batch-scope bypass so the risk floor evaluates the full pending write scope of one atomic action (Phase A1).
- Reduce per-invocation hook cold-start cost on the highest-frequency events (Phase A2).
- Diagnose and cut the Lite-profile artifact ceremony that inflates the two complex benchmark scenarios (Phase B).
- Harden threshold inputs: capability-registry failure modes and implementation-surface counting semantics (Phase C).
- Converge `assets/skill-commands/` from 19 facades + root to ≤5 standalone dirs, projecting the reduction to both hosts with fail-closed retirement (Phase D).
- Close phase-1 debt: CHANGELOG Unreleased kernel entry, the empty `harness-kernel-reduction` review artifact, always-null fields in `run-skill-evals.ts`, installed-profile readback in `status` (Phase E).

**Non-scope (fail-closed — absent = forbidden, per EXECUTION_BOUNDARY)**
- No change to the deterministic risk-floor rules or profile-promotion semantics beyond feeding them the correct inputs (`src/cli/hook/workflow-profile.ts` rule table unchanged).
- No new prompt/LLM/keyword task classifier; `resolveWorkflowProfile()` stays the only risk-floor authority.
- No runtime override command on any guard; `explicit_override_command` stays null by design.
- No propagation of computed batch profiles through `REPO_HARNESS_WORKFLOW_PROFILE` — that channel carries explicit-override semantics (`explicit-override:raise:*` audit reasons, raise-only invariant, `workflow-profile.ts:257-275`) and must not be polluted with derived values.
- No new service, database, steady-state compatibility shim, alias, or dual authority.
- No edits to the in-flight strict task's surfaces: `scripts/contract-run.ts`, `tests/contract-run.test.ts`, `assets/templates/helpers/contract-run.ts`, `docs/architecture/modules/workflow-engine/contract-assets.md`, `.claude/templates/`.
- No second benchmark authority — `run-skill-evals.ts` stays the disposable-state eval; the profile benchmark stays the live-provider authority.

## Evidence Baseline

### Benchmark (authoritative run)

Source: `evals/harness/reports/profile-comparison.json`, run `36252e77`, commit `82374549`, 27/27 live pass.

The Lite cost is concentrated in exactly two of nine scenarios:

| Scenario | Profile | model_calls | total_dur_ms | task_artifacts | in/out tokens |
|---|---|---:|---:|---:|---:|
| cross-capability-feature | lite | 18 | 115881 | 5 | 13635 / 5037 |
| cross-capability-feature | strict | 11 | 53684 | 0 | 10312 / 2482 |
| database-migration | lite | 16 | 108438 | 5 | 15287 / 4359 |
| database-migration | strict | 7 | 39780 | 0 | 7797 / 1176 |

These two scenarios hold all 10 of Lite's task artifacts, 34 of 69 model calls (49%), and 224k of 496k total duration (45%). On the other seven scenarios Lite and Strict are comparable. `artifact_files_created` counts provider-created files under `plans|tasks|.ai/harness` (`scripts/run-harness-profile-benchmark.ts:495`); Strict pre-projects a 2-file envelope and the agent adds zero. [inferred, high-confidence] Because Lite's output tokens are 2-4x Strict's and model calls ~2x on precisely the artifact-creating scenarios — and hook-written state files consume neither output tokens nor model calls — the 10 artifacts are agent-authored workflow ceremony, not hook spill.

Hook cold-start is a real but secondary, profile-independent tax. Aggregate hook wall time: Lite 67.6s (373 ms/call, 181 calls), Strict 60.3s (410 ms/call, 147 calls) — hooks do not explain the Lite-vs-Strict gap; they explain the harness-vs-no-harness floor. The hot path is verified expensive: one PreToolUse edit fires `worktree-guard.sh` then `pre-edit-guard.sh`, and the latter spawns two Bun cold-starts — `bun … state resolve --json` then a second `bun -e` just to parse `workflow_profile` out of the JSON it already produced (`assets/hooks/pre-edit-guard.sh:90,102`).

### Verified guard gap (cross-model review, verified 2026-07-13)

A single `apply_patch` touching N files is expanded into N recursive `pre-edit-guard.sh` invocations, each carrying a payload with only one `file_path` (`assets/hooks/pre-edit-guard.sh:26-34`, marker `REPO_HARNESS_APPLY_PATCH_PATH_EXPANDED`, extractor `hook_get_apply_patch_paths` at `assets/hooks/hook-input.sh:251-265`). `resolve_edit_workflow_profile()` then passes only that single path to the resolver (`pre-edit-guard.sh:85`: `--target-path "$FILE_PATH"`). Because batch siblings are not yet on disk, the diff-merge that saves sequential edits (`src/cli/hook/state-snapshot.ts:697-701`, union of git-status paths and explicit target paths) sees nothing.

Live reproduction: a 4-file `apply_patch` over plain implementation files passed all four recursive checks as lite (exit 0, TDD advisory only); the same four files edited sequentially tripped `SpecGuard` (exit 2) on the fourth edit. The medium-scope (≥4 paths) and cross-capability standard promotions are both bypassable in one atomic action. Strict path-token categories (auth/migration/deploy/…) are unaffected — a single risky path still promotes on its own, which is why existing integration tests pass. The CLI is already variadic (`src/cli/commands/state.ts:12`: `--target-path <path...>`); the hook side simply never uses it.

### Threshold input gaps (verified 2026-07-13)

- `capabilityIdsForPaths` (`src/cli/hook/state-snapshot.ts:432-464`) silently returns `[]` on missing registry file, corrupt JSON, non-array `capabilities`, or unmatched prefixes — all four failure modes collapse to `capabilityCount=0`, silently disabling cross-capability promotion.
- Two definitions of "workflow surface" coexist: shell `is_workflow_surface_path()` (`pre-edit-guard.sh:135-141`: `plans/ tasks/ docs/ .ai/ .claude/ .codex/ *.md`) vs TS `isOperationalReviewPath()` (`src/cli/hook/diff-fingerprint.ts:344-364`: only reviews plus a few runtime files). Consequence: a docs-only session internally resolves `standard` (docs paths count toward medium-scope) while the gates exempt it — harmless today, but once Phase B keys ceremony guidance off the resolved profile, the inflated profile would surface wrong guidance.
- The Standard plan gate is policy-configurable (`.guards.edit_plan_gate`: `enforce|advice|off`, default `enforce`, `pre-edit-guard.sh:143-149`); the Strict contract/worktree guard is verified independent of that knob (`pre-edit-guard.sh:214-230`).

### Facade surface and phase-1 debt

Both `~/.claude/skills` and `~/.codex/skills` carry all 20 `repo-harness*` dirs. The install transaction already has per-profile facade capture/retirement machinery (`src/cli/installer/install-profile.ts:218-229`) and fail-closed handling for non-facade host content (lines 173-178). Root `SKILL.md` structurally delegates to exactly three facades: `repo-harness-plan`, `repo-harness-check`, `repo-harness-handoff`.

CHANGELOG `[Unreleased]` has no kernel entry (only agent-fleet items); `tasks/reviews/20260712-2327-harness-kernel-reduction.review.md` is an all-zero template at `Recommendation: fail`; `scripts/run-skill-evals.ts:1071-1072` hardcodes `modelCallCount/subagentCallCount: null`. Install-state: the only repo reference to `install-state.json` is the path builder (`src/cli/installer/install-profile.ts:269`); `src/cli/commands/status.ts` has no readback, and the file is absent on a host that has routes installed.

## Success Criteria (ratio-based; gate on same-run ratios, not absolute ms)

Criteria 1-4 are locked by re-running `scripts/run-harness-profile-benchmark.ts` live and regrading, replacing `evals/harness/reports/profile-comparison.{json,md}`.

1. **Lite artifact ceremony** — aggregate Lite `task_artifacts` ≤ 2 across all 9 scenarios (from 10); ≤ 1 on any non-planning scenario; the two complex scenarios' Lite `total_duration_ms` ≤ 1.4x same-run Strict (from 2.16x and 2.73x).
2. **Lite convergence toward Strict** — aggregate Lite `model_call_count` ≤ Strict + 4 (from 69 vs 55); aggregate Lite `total_duration_ms` ≤ 1.10x Strict (from 1.27x).
3. **Harness floor** — aggregate Lite `known_tokens` ≤ 1.85x no-harness (from 2.10x); aggregate Lite `hook_total_duration_ms` ≤ 0.85x current (~≤57.5k ms, from 67.6k), achieved by removing ≥1 Bun cold-start per edit; hook-diet phase-probe p95 ≤ 250 ms baseline, `script_invocation_count` not increased (`scripts/hook-dispatch-diet-report.ts:14`).
4. **No regression** — matrix stays 27/27 pass; no scenario regresses >10% vs its current same-profile duration except the two intentionally reduced; preserved-invariant regression tests pass.
5. **Threshold integrity** — the batch integration suite passes: 3-normal-file patch → lite; 4-normal-file patch → standard gate trips under default policy; two-capability patch → standard; duplicate/reordered patch paths → stable count; batch containing one strict-category path → strict for every implementation path; 4-file batch requesting lite → `PROFILE_BELOW_RISK_FLOOR`. Invalid/corrupt registry and unmapped paths produce structured reasons or blockers, never silent `capabilityCount=0`. Medium-scope counting excludes workflow surfaces, locked by tests (4 docs → lite; 3 docs + 1 src → lite).
6. **Facade convergence** — standalone host skill dirs reduced from 20 to ≤ 5; every removed facade's content has a named destination; host install smoke retires removed dirs on both hosts without touching non-facade content.
7. **Debt closed** — CHANGELOG kernel entry present; review artifact closed or archived; `run-skill-evals.ts` carries no always-null field; `repo-harness status` reads back installed profile.

## Concurrency

In-flight strict task `20260712-2103-agent-fleet-worker-routing-telemetry` (executing) owns `scripts/contract-run.ts`, `tests/contract-run.test.ts`, `assets/templates/helpers/contract-run.ts`, `docs/architecture/modules/workflow-engine/contract-assets.md`, `.claude/templates/`, `.ai/context/capabilities.json`, its own contract/review/notes. Phase 2 touches none of its code paths; Phase D does not touch `.ai/context/capabilities.json` (facades live in `assets/skill-commands/`). Phase C1 reads the registry format but changes only resolver code in `src/cli/hook/`, not the registry file. Shared append surfaces `plans/` and `tasks/todos.md` are append-only. Phase 2 may run in parallel.

## Task Breakdown

### Phase A — Guard batch-scope correctness + hot-path cold-start reduction (P0)

**A1 — apply_patch full-batch scope (safety, lands first).** In `resolve_edit_workflow_profile()` (`assets/hooks/pre-edit-guard.sh:82-104`): when the invocation is a recursive apply_patch expansion (`REPO_HARNESS_APPLY_PATCH_PATH_EXPANDED=1` and the payload still carries the original patch command), re-extract the full path set via `hook_get_apply_patch_paths` and pass every path as variadic `--target-path` to `state resolve` — the CLI already supports it (`src/cli/commands/state.ts:12`). Every recursive check then evaluates the same full action scope: a 4-file patch resolves standard on each of its four checks, and a batch containing one strict-category path resolves strict for every implementation path. Non-patch edits keep the current single-path call (the diff-merge already covers sequential edits).
- Hard constraint: the computed batch profile is never smuggled through `REPO_HARNESS_WORKFLOW_PROFILE` (explicit-override channel; see Non-scope). Full paths go to the resolver on every call.
- Rejected: parse-once / resolve-once / batch-level gate refactor — the cleaner end-state, but it requires splitting the inline shell checks into functions; deferred to the sealed-hooks effort (`route-registry.ts:6`). A1 fixes the safety semantics with a minimal diff.
- Rejected: pre-writing batch paths to a temp state file for the diff-merge to pick up — a shadow channel duplicating what variadic `--target-path` already expresses.

**A2 — single-field resolve output (perf).** Add a single-field output mode to `state resolve` (`--field workflow_profile`) so `pre-edit-guard.sh` and `post-edit-guard.sh` obtain the resolved profile in one Bun call instead of two, deleting the `bun -e` parse at `assets/hooks/pre-edit-guard.sh:102`. The resolver stays the single authority; the flag is a pure output projection.
- Rejected: resident hook daemon/socket — compensating machinery for a ~30-60 ms/call saving; adds a lifecycle and failure mode the fail-closed model forbids.

Edit `assets/hooks/*` (product source), then `bun run sync:hooks` + `bun run check:hooks` to reproject `.ai/hooks/`.

**Files:** `assets/hooks/pre-edit-guard.sh`, `assets/hooks/post-edit-guard.sh`, `.ai/hooks/*` (regenerated), `src/cli/commands/state.ts`, `src/cli/hook/state-snapshot.ts` (output only), `tests/runtime-profile-enforcement.test.ts` (six new batch integration cases from criterion 5), `tests/cli/state-snapshot.test.ts`, `tests/hook-runtime.test.ts`.
**Verify:** `bun test tests/runtime-profile-enforcement.test.ts tests/hook-runtime.test.ts tests/cli/state-snapshot.test.ts`; `bun run check:hooks`; `bun scripts/hook-dispatch-diet-report.ts` (p95 ≤ 250 ms, script count unchanged); Phase-B re-benchmark confirms aggregate hook-time drop.
**Rollback:** revert commit; `sync:hooks`/`check:hooks` restore parity. A1 only widens resolver input — the floor is raise-only, so the failure direction is over-promotion, never under-promotion.

### Phase B — Lite artifact-ceremony instrumentation + ceremony trigger threshold (P0, dominant lever)

**B1 — instrument (independently mergeable):** add per-record `artifact_files: string[]` (paths already computed at `scripts/run-harness-profile-benchmark.ts:495`) to the JSON report. Ships the falsifier for B2's hypothesis.

**B2 — ceremony trigger threshold, bound at the single source:** user directive (2026-07-13): workflow ceremony (authoring plan/contract/notes/todos files) must sit behind a trigger threshold — only medium/large tasks with substantial module changes may trigger it; everyday small tasks never need it. The threshold IS the existing deterministic profile floor (`src/cli/hook/workflow-profile.ts`: ≥4 implementation target paths or cross-capability → standard; auth/payment/schema/migration/deploy/release/public-api/destructive → strict) — no new classifier, no natural-language input. The effective-state resolver's `next_action`/guidance encodes the ceremony bound per resolved profile:
- `lite` (small tasks): brief → edit → targeted test; explicitly excludes authoring plan/contract/notes/todos/checks files. Zero ceremony.
- `standard` (medium, multi-file or cross-capability): at most the single active-plan artifact; no contract/notes/todos scaffolding beyond it.
- `strict`: full envelope, unchanged.

The SessionStart renderer (`assets/hooks/session-start-context.sh`) renders the resolver's guidance rather than carrying its own copy. Supporting evidence that this is the right cut: the two blowup scenarios ran forced-lite inside the matrix cell, but under real adaptive routing the deterministic floor would promote them anyway (cross-capability-feature → standard, database-migration → strict) — real-world lite is genuinely small tasks, where zero ceremony is unconditionally correct. Phase C2's surface-counting fix keeps this guidance honest for docs-only sessions.

- Contingency branch (if B1 shows the artifacts are `.ai/harness/runs|checks` hook spill, not `plans|tasks` ceremony): the fix instead moves per-invocation hook runtime writes out of the measured workspace / makes them idempotent.
- Rejected: give Lite a pre-projected envelope like Strict — reintroduces the ceremony cost and blurs the Lite/Strict boundary.
- Rejected: drop the seeded active-plan from the Lite benchmark projection — cuts fidelity and hides the bug.

**Files:** `scripts/run-harness-profile-benchmark.ts` (B1); `src/cli/hook/state-snapshot.ts`, `assets/hooks/session-start-context.sh`, `.ai/hooks/*` (B2); `tests/cli/state-snapshot.test.ts`, `tests/hook-runtime.test.ts`; regenerated `evals/harness/reports/profile-comparison.{json,md}`.
**Verify:** focused tests green; `bun run check:hooks`; live re-run `bun scripts/run-harness-profile-benchmark.ts` + regrade → success criteria 1-4; matrix 27/27. Execution workers on sonnet-class models, never the main loop.
**Rollback:** revert; prior authoritative report restored from git; guidance change is text-only with no floor impact.

### Phase C — Threshold input hardening (P1)

**C1 — capability registry resolution hardening.** Replace the silent-empty contract of `capabilityIdsForPaths` (`src/cli/hook/state-snapshot.ts:432-464`) with a structured result: `{ ids, registryStatus: 'valid' | 'absent' | 'invalid', unmappedPaths }`. Policy, fail-closed and reason-stable:
- `invalid` (corrupt JSON, non-array) or declared-but-missing registry → structured blocker naming the repair (consistent with the resolver's existing fail-closed stance on absent risk signals); never silent `capabilityCount=0`.
- Repos that never declared a registry → `registryStatus:'absent'`, today's no-signal behavior, but with an explicit reason recorded.
- Unmapped implementation paths → stable reason (`capability:unmapped:<n>`) and the unmapped set counts as one additional capability bucket for the cross-capability signal, so unmapped never silently lowers the floor.

**C2 — implementation-surface predicate unification.** One TS predicate (`isImplementationSurfacePath()` in `src/cli/hook/diff-fingerprint.ts`, replacing the ad-hoc `isOperationalReviewPath` exclusions for counting purposes) owns "what counts toward medium-scope"; the medium-scope `targetPathCount` counts implementation surfaces only. The shell `is_workflow_surface_path()` case list is projected from the same source with a drift check (extend `check:hooks`), honoring the one-source-of-truth rule. Semantics locked by tests: 4 docs files → lite; 3 docs + 1 src → count 1 → lite; mixed workflow+implementation patch → only implementation paths counted; strict path-token categories unaffected by the exclusion.

**C3 — Standard gate semantics recorded as a decision (docs-only).** Keep `.guards.edit_plan_gate` (`enforce|advice|off`, default `enforce`) as the gate-response knob; the risk-floor computation itself is never configurable; the Strict contract/worktree guard stays independent of the knob (verified `pre-edit-guard.sh:214-230`). Record this split in `docs/architecture/modules/workflow-engine/` so "computed standard" vs "enforced standard" is documented product semantics, not an accident.

- Rejected: blocking on any unmapped path — too hostile for repos with partial registries; the one-bucket rule preserves the floor without freezing adoption.
- Rejected: keeping two independent surface definitions with a comment — the drift already produced a wrong internal profile; comments don't check themselves.

**Files:** `src/cli/hook/state-snapshot.ts`, `src/cli/hook/diff-fingerprint.ts`, `src/cli/hook/workflow-profile.ts` (reason strings only), `assets/hooks/pre-edit-guard.sh` + `.ai/hooks/*` (projected predicate), `scripts/check-hook-parity.sh` or equivalent `check:hooks` extension, `tests/harness-runtime-profiles.test.ts`, `tests/runtime-profile-enforcement.test.ts`, `tests/cli/state-snapshot.test.ts`, `docs/architecture/modules/workflow-engine/` (C3).
**Verify:** `bun test` focused suites; `bun run check:hooks`; `bash scripts/check-architecture-sync.sh`.
**Rollback:** revert; predicates are pure functions; C1's blocker path is new behavior gated behind registry invalidity, absent in healthy repos.

### Phase D — Skill facade convergence (P1)

Keep as standalone host-advertised skill dirs only:

| Keep (≤5) | Why |
|---|---|
| `repo-harness` (root) | five-action router |
| `repo-harness-plan` | SKILL.md action 2 delegate; interactive |
| `repo-harness-check` | action 4 delegate; installer already special-cases it |
| `repo-harness-handoff` | action 5 delegate; installer already special-cases it |
| `repo-harness-gptpro` | external-integration trigger vocabulary orthogonal to workflow verbs |

Disposition of the other 14:
- Fold into `references/harness-overview.md` (root skill lazy-loads), then delete the dir: `repo-harness-init`, `-scaffold`, `-migrate`, `-upgrade`, `-capability`, `-repair`, `-deploy`, `-ship`, `-architecture` (thin CLI wrappers, no distinct multi-step procedure).
- Convert to on-demand `references/<name>.md` under the root skill, then delete the standalone dir: `repo-harness-prd`, `-sprint`, `-goal`, `-autoplan`, `-review`, `-gptpro-setup`.

Explicit-entry preservation: the durable explicit entry is the slash-command router (`src/cli/hook/prompt-router.ts:8-17`), independent of facade dirs. Facade names appear as recommended-action strings only at `src/cli/hook/prompt-intents.ts:480` and `assets/hooks/prompt-guard.sh:626` (`repo-harness-plan`, which is kept). Hard rule: before deleting any facade, grep `prompt-intents.ts` + `prompt-guard.sh` for its name; a deleted facade name must be updated in lockstep — no dangling recommendation.

One-shot, fail-closed retirement: reduce the canonical set in `assets/skill-commands/` + `manifest.json`; the profile installer and `scripts/sync-codex-installed-copies.sh` project from it. Extend the installer's owner-marker retirement (`install-profile.ts:173-178, 218-229`) to remove now-absent facades on both hosts. No steady-state alias; the removed path is gone in the same work-package.

- Rejected: keep facades as thin alias skills — forbidden steady-state compatibility layer.
- Rejected: delete all 16 non-core facades outright — loses genuinely interactive prd/sprint/goal/autoplan/gptpro procedures.

**Files:** `assets/skill-commands/**`, `assets/skill-commands/manifest.json`, `SKILL.md` (if action text names a removed facade), `src/cli/installer/install-profile.ts`, `scripts/sync-codex-installed-copies.sh`, `src/cli/hook/prompt-intents.ts` / `assets/hooks/prompt-guard.sh` only if a named facade is removed, installer/parity tests.
**Verify:** `bun test`; disposable-HOME install smoke (harness-evaluator profile) showing 20→≤5 dirs on both hosts and non-facade content untouched; `bun src/cli/index.ts adopt --repo . --dry-run`.
**Rollback:** revert restores the canonical set; re-running install/sync re-projects the full facade set (transaction is idempotent via owner-marker).

### Phase E — Gap cleanup (P2, quick wins, each its own commit)

1. **CHANGELOG:** add the kernel-reduction entry under `[Unreleased]` (profiles, explicit-first routing, SessionStart budget, effective-state resolver, circuit breakers, install profiles). Files: `docs/CHANGELOG.md`.
2. **Review artifact:** close `tasks/reviews/20260712-2327-harness-kernel-reduction.review.md` against phase-1's landed WP1-8 with a real recommendation, or archive it if phase-1 closeout owns the record.
3. **Dead schema:** delete `modelCallCount`/`subagentCallCount` from `scripts/run-skill-evals.ts` (`:132-133,1071-1072,1278`). Structurally always-null; the profile benchmark owns those metrics. Delete, don't wire — wiring would create a second benchmark authority. Files: `scripts/run-skill-evals.ts`, its test.
4. **Installed-profile readback:** persistence exists only on the global install path (`install-profile.ts:269` path builder) and nothing reads it back — `status.ts` has no reference and the file is absent on an installed host. Add readback to `repo-harness status` (installed profile + routes, "(not recorded)" when the file is absent) and persist install-state on the repo-local install entrypoint if the write is confirmed missing there. Files: `src/cli/commands/status.ts`, `src/cli/installer/install-profile.ts`, status test.

**Verify (all E):** `bun test`; `bash scripts/check-architecture-sync.sh`; `bash scripts/check-task-sync.sh`; `repo-harness run check-task-workflow --strict`.

## Repo-wide Required Checks (every phase, before its accept gate)

`bun test` · `bash scripts/check-deploy-sql-order.sh` · `bash scripts/check-architecture-sync.sh` · `bash scripts/check-task-sync.sh` · `repo-harness run check-task-workflow --strict` · `bun scripts/inspect-project-state.ts --repo . --format text` · `bun src/cli/index.ts adopt --repo . --dry-run` — plus each phase's specific gate.

## Risks & Most-Fragile Assumption

1. **[Most fragile] Phase B causation.** The ceremony being agent-authored and harness-nudged is inferred from the model-call/output-token/artifact correlation. Mitigation: B1 ships first as the cheap falsifier; the hook-spill contingency branch is pre-designed. If neither branch bounds it, Lite ceremony may be intrinsic provider behavior on complex tasks — the honest outcome is then "documented, not fixed," not a workaround.
2. **A1 over-promotion.** Widening the resolver input can only raise floors, never lower them — but a legitimately large mechanical batch (e.g. generated files) now correctly resolves standard and hits the plan gate. That is the intended semantics of the user's threshold directive; `PROFILE_BELOW_RISK_FLOOR` is the honest answer, and policy `advice` mode remains the pressure valve for repos that want softer standard gates.
3. **Benchmark variance.** All gates are same-run ratios vs no-harness/Strict baselines. The live re-run is ~27 provider calls (~8-13 min), execution on sonnet-class workers only.
4. **Phase D host mutation.** Retiring skill dirs writes to user machines; the fail-closed owner-marker path must be exercised in the disposable-HOME smoke before any real host run. Modified/unknown facade content is preserved, never clobbered.
5. **C1 blocker friction.** Fail-closed on invalid registry is new behavior; a repo with a long-corrupt registry discovers it at the next edit. That is the point — but the blocker message must name the exact repair command.

## What Would Change the Plan

- B1 showing the 10 Lite artifacts are hook spill → Phase B pivots to the contingency branch.
- A1 discovering host payloads where the recursive invocation cannot recover the original patch command → escalate to a batch-level pre-check before recursion (the deferred parse-once design pulled forward).
- Facade-name recommendations wired deeper than `prompt-intents.ts:480` + `prompt-guard.sh:626` → Phase D blast radius grows; re-sequence after a fuller grep audit.

## Priority Reasoning

Phase A leads because A1 is now a verified, reproduced bypass of the deterministic risk floor — the same floor Phase B's ceremony threshold and the whole "threshold = profile" design stand on; hardening the floor's inputs before keying more behavior off it is strict dependency order, not taste. Phase B follows as the dominant measured cost lever (the Lite ceremony alone is ~45% of Lite's duration and the entire Lite-vs-Strict gap). Phase C hardens the same floor's remaining inputs (registry failure modes, surface counting) — its failure modes are edge conditions rather than the common path, so it trails B but precedes the ergonomics work. Phase D carries the highest blast radius (a one-shot fail-closed migration mutating both hosts) and no regression pressure; it goes after the floor is sound. Phase E is independent cleanup. Within A, A1 (safety) lands before A2 (perf); within B, B1 lands before B2 so the hypothesis is confirmed or falsified before the fix.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Execute captured plan: Harness Kernel Optimization Phase 2
