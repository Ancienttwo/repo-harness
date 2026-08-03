# Task Contract: wp3-no-progress-circuit-breaker

> **Status**: Active
> **Plan**: plans/plan-20260803-2040-wp3-no-progress-circuit-breaker.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-08-03 20:40
> **Review File**: `tasks/reviews/20260803-2040-wp3-no-progress-circuit-breaker.review.md`
> **Notes File**: `tasks/notes/20260803-2040-wp3-no-progress-circuit-breaker.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

A long-run loop without a stall detector burns turns forever on a unit that
is not moving: the host keeps fetching `continue_active_plan`, the agent
keeps "working", and nothing changes the material state. LoopX solves this
with a quota ledger; this program's adjudicated design
(`docs/researches/20260803-loopx-comparative-analysis.md` round-2 addendum)
solves it with progress-hash comparison instead: `progress_token` already
moves if and only if real subject/evidence/task/blocker/scope progress
happens, so two consecutive completed turns with an unchanged token are
proof of a stalled loop. WP3 is the last code piece of the continuation
loop; WP4 documents the host tick around it.

## Goal

Add the no-progress circuit breaker on top of WP2's envelope:

1. **`AttemptReceiptV1` recorder** — a new `repo-harness state attempt`
   subcommand that appends one receipt
   `{protocol: 1, kind: "repo-harness-attempt-receipt", unit_ref,
   before_progress_token, after_progress_token, outcome, recorded_at}` to an
   append-only ledger at `.ai/harness/runs/continuation/attempts.jsonl`
   (ignored runtime evidence; single ledger file, atomic flock append —
   `<run-id>` sharding is deliberately rejected until contention is
   observed). `outcome ∈ {completed, halted, resumed}`. The recorder is
   dumb: it validates shape and appends; it derives nothing, reads no state,
   and never touches tracked files. `--outcome resumed` (explicit user
   resume) may omit the token fields.
2. **Stall detection in the envelope** — `state next` additionally reads the
   attempt ledger (read-only) and, when the ledger's trailing entries for
   the CURRENT envelope's `unit_ref` contain ≥2 consecutive
   `outcome=completed` receipts with `before_progress_token ===
   after_progress_token === the current progress_token`, the route becomes
   `halt` with reason `no_progress`. The counter resets naturally on token
   change (a receipt whose tokens differ, or a current token differing from
   the receipts') and on an explicit `resumed` receipt appearing after the
   stalled entries.
3. **Authority fences** (test-enforced): receipts never enter Effective
   State resolution, `state_revision`, or the `progress_token` recipe; the
   only thing the ledger can influence is the envelope's route flipping to
   `halt:no_progress`. Token comparison is envelope-to-envelope only — the
   inspect-scoped envelope token is never compared against an edit-scoped
   `state resolve` token (binding constraint recorded in WP2's review).

Determinism restated for WP3: identical repo bytes + identical attempt
ledger bytes → byte-identical `state next` output. `recorded_at` exists only
inside ledger entries, never in envelope output.

## Scope

- In scope: `src/cli/commands/state.ts` (new `attempt` subcommand),
  `src/core/state/` pure logic (receipt type, stall evaluation over a
  receipt sequence), `src/effects/state/` IO (ledger append with flock,
  ledger read for the envelope resolver), extension of
  `project-continuation-envelope.ts` / `resolve-continuation-envelope.ts`,
  new tests, the contract's notes file.
- Out of scope: WP1 journal surfaces (`scripts/`,
  `assets/templates/helpers/`); WP4 conformance doc;
  `.ai/harness/policy.json`; any change to `resolveEffectiveState` inputs or
  the `progress_token` recipe; any scheduler/timer/quota semantics; receipt
  GC or rotation (defer; ledger is ignored runtime evidence); MCP changes.
- Taste constraints: match WP2's pure-projector/IO-resolver split; ledger
  append follows the house atomic-append pattern; no new dependencies.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if stall detection cannot be expressed without persisting derived
  state outside the ledger (e.g. a counter file) — the ledger is the only
  new runtime surface this WP may create.

## Falsifier

Direction is wrong if `progress_token` fails to move on real, valid
material progress (then the fingerprint recipe must be fixed — heuristics
must NOT be added here; stop and hand back), or if the envelope cannot read
the ledger without breaking its zero-write contract. Cheapest proof point
first: in a fixture repo, make a real change (check a plan task, land
evidence), fetch the envelope before and after, and confirm the token
moved; if it did not, stop and report.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260803-2040-wp3-no-progress-circuit-breaker.md`
- Sprint: `plans/sprints/20260803-1810-long-run-anti-drift.sprint.md` (WP3 spec)
- Research: `docs/researches/20260803-loopx-comparative-analysis.md` (round-2 addendum: attempt-ledger honesty, falsifiability clause)
- WP2 constraints: `tasks/archive/review-20260803-2034-wp2-canonical-continuation-envelope.md` (inspect-scoped token, envelope-to-envelope comparison)
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260803-2040-wp3-no-progress-circuit-breaker.review.md`
- Notes file: `tasks/notes/20260803-2040-wp3-no-progress-circuit-breaker.notes.md`
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
  - src/
  - tests/
  # plans/ and tasks/todos.md stay at scaffold scope: finish machinery moves
  # the plan into plans/archive/, back-fills the sprint row, and stamps the
  # ledger (WP1 lesson - machinery write surfaces must not be narrowed away).
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260803-2040-wp3-no-progress-circuit-breaker.contract.md
  - tasks/reviews/20260803-2040-wp3-no-progress-circuit-breaker.review.md
  - tasks/notes/20260803-2040-wp3-no-progress-circuit-breaker.notes.md
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
    - src/cli/commands/state.ts
    - tests/continuation-attempt.test.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260803-2040-wp3-no-progress-circuit-breaker.notes.md
  tests_pass:
    - path: tests/continuation-attempt.test.ts
    - path: tests/continuation-envelope.test.ts
    - path: tests/sprint-backlog-grammar-drift.test.ts
    - path: tests/effective-state.test.ts
    - path: tests/check-state-boundaries.test.ts
  commands_succeed:
    - bun run check:type
```

## Acceptance Notes (Human Review)

- Functional behavior: two no-progress completed receipts on the current
  unit flip the envelope to `halt` reason `no_progress`; a token-moving
  receipt or a `resumed` receipt resets the count; receipts for a different
  `unit_ref` never influence the current unit's route; the recorder appends
  exactly one line per call under flock and is safe under concurrent
  appends.
- Edge cases: empty/absent ledger (envelope behavior identical to WP2);
  corrupt/unparseable ledger line → the breaker cannot do its job, so the
  envelope fails closed: route `halt` with distinct reason
  `attempt_ledger_unreadable` (silently skipping lines could mask a real
  stall; a crash would be worse — parent-level decision, fixed here);
  exactly one no-progress receipt (no halt); stalled receipts followed by
  `resumed` then another no-progress receipt (count restarts at 1, no halt).
- Regression risks: WP2 envelope behavior unchanged when the ledger is
  absent; determinism contract extended, not weakened; zero writes from
  `state next` still proven (ledger reads only).

## Rollback Point

- Commit / checkpoint: worktree branch `codex/wp3-no-progress-circuit-breaker` based on main `c4cce83a`.
- Revert strategy: discard the branch/worktree; no primary-tree state is touched before finish.
