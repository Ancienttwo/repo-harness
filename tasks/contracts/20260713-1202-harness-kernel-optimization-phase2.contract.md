# Task Contract: harness-kernel-optimization-phase2

> **Status**: Active
> **Plan**: plans/plan-20260713-1202-harness-kernel-optimization-phase2.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-13 12:36
> **Review File**: `tasks/reviews/20260713-1202-harness-kernel-optimization-phase2.review.md`
> **Notes File**: `tasks/notes/20260713-1202-harness-kernel-optimization-phase2.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Phase 1 landed the kernel (profiles, explicit-first routing, context budget, effective state, circuit breakers) but the authoritative benchmark shows Lite is slower than Strict with equal tokens, and a cross-model review produced a live-reproduced bypass: a batched `apply_patch` never shows the risk floor its full pending scope, so medium-scope and cross-capability standard promotion can be skipped in one atomic action. Shipping wrong here either leaves a guard hole (batch scope) or keeps the harness 2x more expensive than no harness with no offsetting safety story.

## Goal

Execute plan phases A-E exactly as written in the plan's `## Task Breakdown`:
A) apply_patch full-batch scope fix + single-field `state resolve` output; B) benchmark `artifact_files` instrumentation + ceremony trigger threshold bound to the deterministic profile floor (lite: zero ceremony; standard: at most the active plan; strict: unchanged); C) capability-registry hardening + implementation-surface predicate unification + gate-semantics doc; D) skill facade convergence 20 -> <=5 with fail-closed retirement; E) debt cleanup (CHANGELOG, stale review closure, dead schema fields, installed-profile readback). Each phase is independently mergeable with its own accept gate; the plan's Success Criteria 1-7 define done.

## Scope

- In scope: exactly the files named per phase in the plan's `## Task Breakdown`, plus regenerated projections (`.ai/hooks/*`, `evals/harness/reports/profile-comparison.{json,md}`).
- Out of scope: risk-floor rule changes, guard override commands, `REPO_HARNESS_WORKFLOW_PROFILE` as a derived-value channel, new classifiers, compatibility aliases, the in-flight strict task's surfaces (`scripts/contract-run.ts`, `tests/contract-run.test.ts`, `assets/templates/helpers/contract-run.ts`, `docs/architecture/modules/workflow-engine/contract-assets.md`, `.claude/templates/`).
- Taste constraints: EXECUTION_BOUNDARY — absent requirements are forbidden design space; unrequested extras fail closed. Follow the minimal-change policy; match surrounding shell/TS idiom.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if A1 finds host payloads where the recursive invocation cannot recover the original patch command (plan escalation: batch-level pre-check pulled forward — parent decision).
- Stop if B1 instrumentation shows the Lite artifacts are hook spill rather than `plans|tasks` ceremony (plan contingency branch — parent confirms pivot before B2).

## Falsifier

B2's premise (Lite ceremony is agent-authored, harness-nudged) is falsified if B1's `artifact_files` shows the 10 Lite artifacts under `.ai/harness/runs|checks` instead of `plans|tasks`. Cheapest proof point: land B1, re-read the existing authoritative report's changed-path data before any B2 code. Phase A's premise is already proven by live repro (4-file patch -> 4x lite exit 0 vs sequential edits -> SpecGuard exit 2).

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `assets/hooks/pre-edit-guard.sh:26-34` recursive apply_patch payloads carry a single `file_path`; `:85` passes only `--target-path "$FILE_PATH"`, so `resolveWorkflowProfile` never sees the batch scope (siblings not yet on disk are invisible to the diff merge at `src/cli/hook/state-snapshot.ts:697-701`).
- repro: run `pre-edit-guard.sh` against a 4-implementation-file apply_patch payload — all four recursive checks exit 0 as lite; the same files edited sequentially trip SpecGuard (exit 2) on the fourth.
- regression_guard: tests/runtime-profile-enforcement.test.ts (new batch-scope cases; must fail on unfixed code).
- pre_fix_failure_artifact: .ai/harness/runs/phase2-a1-prefix-failure.txt

## Workflow Inventory

- Source plan: `plans/plan-20260713-1202-harness-kernel-optimization-phase2.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260713-1202-harness-kernel-optimization-phase2.review.md`
- Notes file: `tasks/notes/20260713-1202-harness-kernel-optimization-phase2.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260713-1202-harness-kernel-optimization-phase2.contract.md
  - tasks/reviews/20260713-1202-harness-kernel-optimization-phase2.review.md
  - tasks/reviews/20260712-2327-harness-kernel-reduction.review.md
  - tasks/reviews/archive/
  - tasks/notes/20260713-1202-harness-kernel-optimization-phase2.notes.md
  - src/
  - tests/
  - assets/hooks/
  - assets/skill-commands/
  - .ai/hooks/
  - .ai/harness/runs/
  - scripts/run-harness-profile-benchmark.ts
  - scripts/run-skill-evals.ts
  - scripts/sync-codex-installed-copies.sh
  - scripts/sync-hook-sources.ts
  - SKILL.md
  - docs/CHANGELOG.md
  - docs/architecture/
  - evals/harness/reports/
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    tool_calls: null
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
    - docs/spec.md
    - evals/harness/reports/profile-comparison.json
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260713-1202-harness-kernel-optimization-phase2.notes.md
  tests_pass:
    - path: tests/runtime-profile-enforcement.test.ts
    - path: tests/harness-runtime-profiles.test.ts
    - path: tests/hook-runtime.test.ts
    - path: tests/cli/state-snapshot.test.ts
  commands_succeed:
    - bun test
    - bun run check:hooks
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts adopt --repo . --dry-run
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Regraded profile-comparison matrix stays 27/27 and meets plan Success Criteria 1-4 ratios"
    - "Disposable-HOME install smoke shows facade dirs 20 -> <=5 on both hosts, non-facade content untouched"
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: batch apply_patch promotes on full scope; lite sessions get zero-ceremony guidance; invalid registry blocks with named repair instead of silent capabilityCount=0.
- Edge cases: duplicate/reordered patch paths; docs-only batches; repos with absent (never-declared) registries; hosts with user-modified facade dirs.
- Regression risks: over-promotion of large mechanical batches (intended, raise-only); C1 blocker surfacing latent registry corruption; facade retirement touching user machines (owner-marker path must be smoke-tested first).

## Rollback Point

- Commit / checkpoint: worktree branch `codex/harness-kernel-optimization-phase2`, base `c604e3b`; one commit per phase (A1 and A2 may be separate commits).
- Revert strategy: revert the phase commit; `bun run sync:hooks` + `bun run check:hooks` restore hook parity; regenerated benchmark reports restore from git; facade set re-projects via install/sync (idempotent owner-marker transaction).
