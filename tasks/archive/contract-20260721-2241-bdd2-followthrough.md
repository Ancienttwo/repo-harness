> **Archived**: 2026-07-21 22:41
> **Related Plan**: plans/archive/plan-20260721-1907-bdd2-followthrough.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260721-2241

# Task Contract: bdd2-followthrough

> **Status**: Fulfilled
> **Plan**: plans/plan-20260721-1907-bdd2-followthrough.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-21 21:05
> **Review File**: `tasks/reviews/20260721-1907-bdd2-followthrough.review.md`
> **Notes File**: `tasks/notes/20260721-1907-bdd2-followthrough.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The `[UXFeatureGuard]` advisory currently fires on every feature/implement prompt (backend, CLI, scripts included), which trains agents to ignore it exactly where the anti-developer-view discipline matters. The preview workflow (peer research → imagegen → PRD → taste) has no named owner or authority ceilings, so taste/imagegen-class skills can gild frontend work with unauthorized product semantics. Stale `tasks/todos.md` rows misrepresent sealed BDD3 outcomes. Shipping wrong here means either the advisory noise persists, or — worse — enforcement machinery sneaks back in against the three sealed kill rounds (Phase E/E3, BDD3 EA1/PS1).

## Goal

Deliver exactly four outcomes:

1. **Advisory split (Track A)**: `[BDD]` advisory unchanged on generic feature intent; `[UXFeatureGuard]` advisory emits only when feature intent AND a frontend/UI noun are present in the stripped prompt (`ctx.text`). New classifier `shouldEmitUxFeatureGuardAdvice` in `src/cli/hook/prompt-intents.ts` (composed over `shouldEmitBddFeatureAdvice`; split ZH/EN noun patterns; English word boundaries so `build`/`suite` never match via the `ui` substring). The combined push in `src/cli/hook/prompt-handler.ts` (~line 575) splits into two conditionals with advisory text verbatim. `prompt-guard-decision.ts` verdict facts gain `ux_feature_guard_advice` (echo-only; no routing/blocking impact). Post-HRD-09 there is no bash hook work.
2. **Convention deltas (Track B repo half)**: `design-options.md` (assets + docs mirrors) gains a product-boundary prerequisite before variant generation and a refinement-provider (taste-class) apply-vs-proposal-only ceiling table. `design-brief.template.md` gains a `Role-aware User-visible Concept Boundary` subsection in the UX Feature Guard area plus a `design-proposal` pointer, propagated to all four parity sites via `bun run sync:helpers`. `repo-harness-prd/SKILL.md` step 15 gains an optional-slot pointer naming `design-proposal` with the boundary-before-imagegen ordering.
3. **User-level skill (Track B external half)**: author `~/.claude/skills/design-proposal/SKILL.md` per the plan's content contract (research → boundary freeze → STIMULUS variants → human choice → taste refinement; EXECUTION_BOUNDARY; SKIPPED degradation; boundaries). Repo-external: recorded in notes with smoke evidence, never vendored into the repo.
4. **Ledger closeout (Track C)**: close the BDD² revival and BDD3-PS1 rows in `tasks/todos.md` (match by content; currently rows 16-17) citing the sealed outcome docs; keep VH1; add the rendered-surface verification deferred row with its observed-leak revisit trigger; archive `plans/plan-20260714-1353-design-options-proactive-choice.md` via `repo-harness run archive-workflow --outcome Completed`.

## Scope

- In scope: the plan's File Changes matrix (as amended for HRD-09 drift) — `src/cli/hook/prompt-intents.ts`, `src/cli/hook/prompt-handler.ts`, `src/cli/commands/prompt-guard-decision.ts`, the four test suites, `design-options.md` both mirrors, `design-brief.template.md` and its parity projections, `repo-harness-prd/SKILL.md`, `tasks/todos.md`, the archive-workflow move for the old design-options plan, this contract's notes/review artifacts, and the repo-external `~/.claude/skills/design-proposal/SKILL.md`.
- Out of scope (fail closed): `evals/bdd2/**`, `evals/bdd3/**`, `assets/workflow-contract.v1.json`, `.ai/harness/workflow-contract.json`, any policy.json key or routing row for preview/design-proposal, any `src/**/preview*` module, any classifier/validator/ledger/state machine, any blocking/deny path for these advisories, any Codex-side skill install, any noun-set broadening beyond the plan's frozen sets without a missed-case fixture.
- EXECUTION_BOUNDARY: absent requirements are forbidden design space, not permission to improve; unrequested extras fail closed. Anti-extras never deletes required recovery, status visibility, or accessibility content from the conventions being edited.
- Taste constraints: match surrounding style; smallest change that satisfies the goal; advisory text stays byte-verbatim where the plan says verbatim.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if `prompt-handler.ts` no longer contains the combined advisory push described in the plan (further upstream drift) — report instead of improvising.

## Falsifier

If the frontend-scoped advisory suppresses `[UXFeatureGuard]` on genuinely frontend prompts (missed-case fixtures accumulating in review), the noun-gate direction is wrong. Cheapest proof point: the T4 fixture matrix — `实现一个新功能页面` and `build a dashboard` must both still emit it.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260721-1907-bdd2-followthrough.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260721-1907-bdd2-followthrough.review.md`
- Notes file: `tasks/notes/20260721-1907-bdd2-followthrough.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/
  - src/cli/
  - tests/
  - assets/templates/
  - assets/skill-commands/repo-harness-prd/
  - assets/reference-configs/
  - docs/reference-configs/
  - .claude/templates/
  - scripts/ensure-task-workflow.sh
  - assets/hooks/
  - .ai/hooks/
  - docs/architecture/
```

## Evidence Requirements

```yaml
evidence_requirements:
  # Set benchmark to required when this contract consumes the harness profile benchmark matrix.
  benchmark: not_applicable
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    runner_invocations: null
    wall_time_minutes: null
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent:
      mode: narrate_and_gatekeep
      purpose: approval_checkpoint_owner
    explorer:
      mode: read_only
      purpose: codebase_research
    worker:
      mode: edit_within_allowed_paths
      purpose: implementation
    verifier:
      mode: read_only
      purpose: exit_criteria_review
  runner:
    preferred:
      - subagent
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - assets/templates/design-brief.template.md
    - docs/reference-configs/design-options.md
    - assets/reference-configs/design-options.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260721-1907-bdd2-followthrough.notes.md
  tests_pass:
    - path: tests/cli/prompt-intents.test.ts
    - path: tests/ux-feature-guardrail.test.ts
    - path: tests/hook-runtime.test.ts
    - path: tests/hook-contracts.test.ts
  commands_succeed:
    - bun run check:type
    - bun run check:hooks
    - bun run check:helpers
    - repo-harness run check-task-workflow --strict
```

## Acceptance Notes (Human Review)

- Functional behavior: `[BDD]` unchanged everywhere; `[UXFeatureGuard]` only on feature intent + frontend/UI noun in the stripped prompt; conventions carry boundary-before-imagegen, taste ceiling, role-aware concept boundary; ledger reflects sealed outcomes.
- Edge cases: `build a CLI command` / `build a test suite` must not trigger the UX advisory (no `ui` substring hit); host-injected frontend context on a non-UI request must not trigger it; existing diagnostic/review/passive exclusions unchanged.
- Regression risks: full `bun test` may hit the known pre-existing flake at `tests/state/state-concurrency.test.ts:576` (barrier race, documented in `tasks/todos.md`); a full-suite failure there must be isolated and rerun to prove it is that flake, not assumed.

## Rollback Point

- Commit / checkpoint: branch `codex/bdd2-followthrough` forked from `b5a98c90`; no commits at dispatch time.
- Revert strategy: revert/delete the branch (pure code+prose, no data migration, no schema); remove the repo-external skill with `rm -rf ~/.claude/skills/design-proposal`; sealed `evals/bdd2`/`evals/bdd3` untouched by construction.
