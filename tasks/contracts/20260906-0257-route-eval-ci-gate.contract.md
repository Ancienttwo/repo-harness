# Task Contract: route-eval-ci-gate

> **Status**: Active
> **Plan**: plans/plan-20260906-0257-route-eval-ci-gate.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-06 02:57
> **Review File**: `tasks/reviews/20260906-0257-route-eval-ci-gate.review.md`
> **Notes File**: `tasks/notes/20260906-0257-route-eval-ci-gate.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`src/cli/hook/prompt-intents.ts` is a 580-line regex intent classifier that re-derives LLM-owned semantics; retiring it needs a numeric oracle. The existing route-nl-vs-ts eval has only 9 scenarios and no named CI step, so a classifier regression on an uncovered intent or action is invisible until a user hits it. Skipping this leaves "delete the regex" as a feeling instead of a number.

## Goal

`bun run check:route-eval` runs the TS arm of `scripts/route-nl-vs-ts-eval.ts` over an expanded `ROUTE_SCENARIOS` corpus that covers every `PROMPT_GUARD_INTENTS` entry and every prompt-layer-reachable `PROMPT_GUARD_ACTIONS` entry, prints one line per scenario plus a coverage summary, exits non-zero on any mismatch or coverage shortfall against pinned constants, and runs as the named `[ci] route eval (TS arm)` step in `scripts/check-ci.sh` before `[ci] tests`. NL arm, report protocol, `evals/evals.json`, and runtime prompt-guard behavior are unchanged.

## Scope

- In scope: `scripts/route-nl-vs-ts-eval.ts` (corpus + `--check-ts-arm` mode), `tests/route-nl-vs-ts-eval.test.ts`, `package.json` script, `scripts/check-ci.sh` step, one paragraph in `docs/reference-configs/loop-engine-nl-decision-table.md`, and `tests/bootstrap-files.test.ts` only if its check-ci step assertions need the new line.
- Out of scope: any edit to `src/cli/hook/prompt-intents.ts`, `src/cli/hook/prompt-guard-decision.ts`, `evals/evals.json`, hook runtime, or the NL arm. Do not move scenarios into a separate data file. Do not invent prompts from taste: every scenario cites a `lessonSource` from an existing test, `tasks/lessons.md`, or a decision-table rule. Actions unreachable from the prompt layer go into the plan's `## Unreachable Actions` section with a reason, never faked.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If the TS arm cannot reach most actions from a prompt plus `PromptGuardState` alone (they depend on filesystem or git state the eval cannot fake), the corpus cannot be the oracle and the slice is wrong. Cheapest check: enumerate the branches of `runPromptGuardVerdictFromPrompt` first and count reachable actions before writing scenarios.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260906-0257-route-eval-ci-gate.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260906-0257-route-eval-ci-gate.review.md`
- Notes file: `tasks/notes/20260906-0257-route-eval-ci-gate.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"route-eval-ts-arm","kind":"deterministic_test","paths":["scripts/route-nl-vs-ts-eval.ts","tests/route-nl-vs-ts-eval.test.ts"]},{"id":"ci-chain-wiring","kind":"deterministic_test","paths":["scripts/check-ci.sh","package.json","tests/bootstrap-files.test.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260906-0257-route-eval-ci-gate.md
  - tasks/contracts/20260906-0257-route-eval-ci-gate.contract.md
  - tasks/reviews/20260906-0257-route-eval-ci-gate.review.md
  - tasks/notes/20260906-0257-route-eval-ci-gate.notes.md
  - tasks/todos.md
  - scripts/route-nl-vs-ts-eval.ts
  - scripts/check-ci.sh
  - package.json
  - tests/route-nl-vs-ts-eval.test.ts
  - tests/bootstrap-files.test.ts
  - docs/reference-configs/loop-engine-nl-decision-table.md
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
    fallback: null
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

Choose the smallest checks that cover the changed behavior. Add a full suite
only for an explicit release requirement or an observed cross-module coverage
gap; state that reason and expected cost in Acceptance Notes. Do not duplicate
coverage between `tests_pass` and `commands_succeed`. Before the first run,
list eligible deterministic criteria in `criterion_reuse`; eligibility requires
all inputs to be bound by the frozen subject/toolchain context. Leave external
or mutable-state criteria ineligible. The canonical acceptance runner owns the
expensive execution; workers and reviewers consume its evidence.

If a full suite already passed before a bounded follow-up edit, preserve its
run identity as baseline evidence and choose focused checks for the actual delta.
The parent revises these criteria and records the baseline plus coverage rationale
in Acceptance Notes, unless an explicit user/release requirement still requires
a full run on the new subject. A cache miss alone does not justify another full
suite; never label the old subject's pass as a full pass for the new subject.

```yaml
exit_criteria:
  files_exist:
    - scripts/route-nl-vs-ts-eval.ts
    - scripts/check-ci.sh
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260906-0257-route-eval-ci-gate.notes.md
  tests_pass:
    - path: tests/route-nl-vs-ts-eval.test.ts
    - path: tests/bootstrap-files.test.ts
  commands_succeed:
    - bun run check:route-eval
    - bash -n scripts/check-ci.sh
    - bun run check:type
criterion_reuse:
  tests_pass:
    - path: tests/route-nl-vs-ts-eval.test.ts
    - path: tests/bootstrap-files.test.ts
  commands_succeed:
    - bun run check:route-eval
    - bash -n scripts/check-ci.sh
    - bun run check:type
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
