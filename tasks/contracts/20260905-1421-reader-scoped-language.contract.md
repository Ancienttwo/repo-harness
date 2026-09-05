# Task Contract: reader-scoped-language

> **Status**: Active
> **Plan**: plans/plan-20260905-1421-reader-scoped-language.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-05 14:21
> **Review File**: `tasks/reviews/20260905-1421-reader-scoped-language.review.md`
> **Notes File**: `tasks/notes/20260905-1421-reader-scoped-language.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Shipped templates, skills, and hook advisories mix Chinese and English by accident, and no datum decides which language human-facing documents use. Downstream repos inherit that drift on every init. If skipped, every generated repo keeps bilingual headers that tests and hooks parse literally, and agents keep guessing document language per session.

## Goal

Agent-facing shipped surfaces are English-only, and human-facing document language is a single repo-level datum `.ai/harness/policy.json#documentation.language` (enum `en | zh-CN | follow-user`, default `en`) chosen at init, referenced (not copied) by the generated root context and document-generation rules. Follow `plans/plan-20260905-1421-reader-scoped-language.md` Captured Planning Output for exact file targets.

## Scope

- In scope: Phase 1 (delete six orphan Chinese templates and the metro advisory; English headers in design-brief template and its helper mirror; English-only hook advisory strings; English obsidian-memory skill body; `geju` term; reference-config mirror sync; coupled tests). Phase 2 (policy `documentation.language` with fail-closed validation via env `REPO_HARNESS_DOCUMENTATION_LANGUAGE`; init question renamed `Human-facing language` driving both the global reporting instruction and the repo datum; root-context and document-generation rules; completion-summary label rendered per reporting preset; coupled tests and snapshots).
- Out of scope: this repository's README; zh-TW or other enum values; a `--language` CLI flag; runtime language detection; hook intent regexes, skill trigger phrases in `description`/`when_to_use`, and `src/operator-web/i18n.ts`.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

What observable evidence would prove this task's direction wrong, and the cheapest proof point to check first. Leave as-is if not applicable.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260905-1421-reader-scoped-language.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260905-1421-reader-scoped-language.review.md`
- Notes file: `tasks/notes/20260905-1421-reader-scoped-language.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"focused-tests","kind":"deterministic_test","paths":["*"]},{"id":"init-dry-run-readback","kind":"runtime_readback","paths":["src/core/adoption/standard-plan.ts","src/cli/commands/init.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - docs/reference-configs/
  - plans/
  - assets/
  - scripts/
  - .ai/harness/workflow-contract.json
  - .ai/harness/policy.json
  - tasks/todos.md
  - tasks/contracts/20260905-1421-reader-scoped-language.contract.md
  - tasks/reviews/20260905-1421-reader-scoped-language.review.md
  - tasks/notes/20260905-1421-reader-scoped-language.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/
  - tests/
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

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260905-1421-reader-scoped-language.notes.md
  tests_pass:
    - path: tests/ux-feature-guardrail.test.ts
    - path: tests/global-working-rules-distribution.test.ts
    - path: tests/cli/init.test.ts
    - path: tests/scaffold-parity.test.ts
    - path: tests/bootstrap-files.test.ts
    - path: tests/hook-contracts.test.ts
  commands_succeed:
    - bun run check:type
    - bun run check:reference-configs
    - bun src/cli/index.ts init --repo . --dry-run
# Optional exact-subject reuse is fail-closed and opt-in. List only deterministic
# criteria whose inputs are fully bound by the frozen subject/toolchain context.
# criterion_reuse:
#   tests_pass:
#     - path/to/deterministic.test.ts
#   commands_succeed:
#     - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
