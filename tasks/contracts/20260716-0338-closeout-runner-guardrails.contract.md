# Task Contract: closeout-runner-guardrails

> **Status**: Active
> **Plan**: plans/plan-20260716-0338-closeout-runner-guardrails.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-18 09:50
> **Review File**: `tasks/reviews/20260716-0338-closeout-runner-guardrails.review.md`
> **Notes File**: `tasks/notes/20260716-0338-closeout-runner-guardrails.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Every contract worktree and ship path depends on the closeout runner. The
current outer helper timeout can expire before the verifier's legal inner
budget, and ship invokes the same sprint verifier twice. Leaving either defect
in place makes later LSC packages pay false failures, duplicate release work,
and possible orphaned descendants.

## Goal

Make one closeout execution have one verification owner, one fixed helper-class
budget, one bounded descendant process group, and one Git-common-dir expensive
execution lane shared by linked worktrees.

## Scope

- In scope: immutable helper timeout classes; outer TERM/grace/KILL process-group
  cleanup; removal of ship's duplicate verifier; a fail-closed Git-common-dir
  lock for release verification and authoritative benchmark production; short
  deterministic regressions; packaged-helper parity; required architecture and
  workflow artifacts.
- Out of scope: CRG-02 lifecycle state machine, Loop Semantics, Hook Runtime
  Diet, Evidence Ledger, Skill Surface, legacy-test retirement, compatibility
  paths, a real benchmark matrix, and unrelated cleanup.
- Non-goal (added 2026-07-18, after 3 Codex acceptance rounds; corrected
  2026-07-18 after an independent Claude gatekeeper round-4 review found the
  first version of this Non-goal mischaracterized one of the two remaining
  gaps as Windows-only when it is not): guaranteeing unbounded confirmation
  of process-group death before expensive-run lock release, beyond what each
  fix actually delivers. This review's Residual Risks already recorded,
  before this closeout began, that "Windows has no equivalent negative-PGID
  primitive and uses the existing `taskkill /T` best effort" -- that was the
  accepted baseline CRG-01 started from, not something this package's own
  falsifier (see `## Falsifier` above, which names no Windows condition) or
  Goal ever committed to strengthening.

  There are two distinct fixes here, with two distinct guarantees, and the
  first version of this Non-goal wrongly described both as "Windows-only":

  - `src/effects/process-supervisor.ts`'s exception-path sweep and normal
    timeout/signal path genuinely give a strong, unbounded POSIX guarantee:
    an unbounded real `kill(-pgid, 0)` quiescence poll confirms the process
    group is actually gone before the lock releases, and `processGroupExists()`
    hardcodes `false` only on `win32` -- so on POSIX this fix is accurate and
    unbounded, and the Windows limitation genuinely is confined to `win32`
    (fixed and independently re-verified across two fix rounds).
  - `scripts/run-bounded-verifier-command.ts`'s forced-termination re-poll is
    **not** Windows-specific: it is a 500ms bounded wait on every platform
    (`FORCED_TERMINATION_CONFIRM_MS`). On POSIX, if the process group still
    exists 500ms after the forced KILL, the wrapper gives up and returns
    without confirming absence or flagging the failure -- a real, if narrow,
    POSIX gap, not merely a Windows one. `processGroupExists()`'s hardcoded
    `false` on `win32` in this same file means Windows gets no probe at all,
    which is strictly worse, but the underlying design (a bounded, not
    unbounded, confirmation window) is platform-neutral.

  Accepting the second fix's bounded-on-every-platform behavior as this
  package's ceiling, rather than continuing to iterate: post-group-SIGKILL
  survivors are zombies (harmless here, since this group's topology
  reparents orphans to init, so persistent zombies cannot occur), D-state
  members (an unbounded wait does not help either -- a pending SIGKILL fires
  before any further user-space instruction once they wake), or adversarial
  fork-race escapees (out of this package's threat model). This package
  strictly improved POSIX behavior versus its own pre-fix baseline, which
  confirmed nothing at all after a forced KILL in either file.

  It is close to but not byte-identical to
  `scripts/run-harness-profile-benchmark.ts`'s own Windows handling: that
  sibling file does attempt a real single-PID liveness probe on `win32`
  (`process.kill(pid, 0)` against the leader only, verified by re-reading the
  file, not assumed), where `process-supervisor.ts` and
  `run-bounded-verifier-command.ts` hardcode `false` outright on Windows.

  Real Windows process-tree enumeration and an unbounded (not 500ms-bounded)
  POSIX confirmation window in `run-bounded-verifier-command.ts` are both
  distinct, separately scoped follow-ups; this repo's own CI does not
  exercise these files' tests on Windows either (`.github/workflows/ci.yml`'s
  `test` job, which runs the guardrail tests, is `ubuntu-latest` only).
  Windows lock-preservation in both files, and forced-termination
  confirmation timing in `run-bounded-verifier-command.ts` on every platform,
  remain best-effort by explicit design, not by oversight.
- Taste constraints: preserve synchronous public runner APIs; add no
  policy/environment timeout override; reuse one lock authority and delete the
  duplicate verification path instead of adding result caching.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop after three fail-fix-reverify rounds for any invariant.
- Stop rather than run the 3x9 benchmark matrix; this package proves locking
  with short subprocess fixtures only.

## Falsifier

The direction is wrong if a short descendant sentinel survives the outer
runner timeout, if one ship still invokes the sprint verifier more than once,
or if linked worktrees can simultaneously enter the expensive section. The
cheapest proof is the focused guardrail test on the unfixed base.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `src/effects/process-runner.ts:29,61-75` applies a generic
  120-second `spawnSync` timeout to helpers whose legal verifier budget is 600
  seconds, while `scripts/ship-worktrees.sh:383,397-404` verifies before calling
  `scripts/contract-worktree.sh:651`, which verifies again.
- repro: run the focused unfixed guardrail test that uses a short helper timeout,
  a descendant sentinel, and a stubbed ship/finish trace.
- regression_guard: tests/unit/closeout-runner-guardrails.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/closeout-runner-guardrails/pre-fix.log

## Workflow Inventory

- Source plan: `plans/plan-20260716-0338-closeout-runner-guardrails.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260716-0338-closeout-runner-guardrails.review.md`
- Notes file: `tasks/notes/20260716-0338-closeout-runner-guardrails.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and canonical `## External Acceptance Advice` record `pass` for the current review subject and benchmark evidence.

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260716-0338-closeout-runner-guardrails.md
  - plans/sprints/20260715-harness-loop-audit-and-optimization.md
  - plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260716-0338-closeout-runner-guardrails.contract.md
  - tasks/reviews/20260716-0338-closeout-runner-guardrails.review.md
  - tasks/notes/20260716-0338-closeout-runner-guardrails.notes.md
  - docs/architecture/index.md
  - docs/architecture/modules/workflow-engine/contract-assets.md
  - docs/architecture/modules/verification/evals-checks.md
  - docs/architecture/requests/
  - src/cli/commands/run.ts
  - src/cli/runtime/helper-runner.ts
  - src/effects/process-runner.ts
  - src/effects/process-group-launcher.ts
  - src/effects/process-supervisor.ts
  - src/effects/expensive-run-lock.ts
  - src/effects/git/common-directory.ts
  - src/effects/locking/exclusive-directory-lock.ts
  - src/effects/state/git-state-version-store.ts
  - src/effects/state/state-lock.ts
  - scripts/run-bounded-verifier-command.ts
  - scripts/ship-worktrees.sh
  - scripts/run-harness-profile-benchmark.ts
  - assets/templates/helpers/run-bounded-verifier-command.ts
  - assets/templates/helpers/ship-worktrees.sh
  - tests/unit/closeout-runner-guardrails.test.ts
  - tests/unit/verifier-evidence-lifecycle-cutover.test.ts
  - tests/helper-scripts.test.ts
  - tests/state/state-effects.test.ts
  - tests/state/state-concurrency.test.ts
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
    - src/effects/expensive-run-lock.ts
    - src/effects/git/common-directory.ts
    - src/effects/locking/exclusive-directory-lock.ts
    - src/effects/process-group-launcher.ts
    - src/effects/process-supervisor.ts
    - tests/unit/closeout-runner-guardrails.test.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - .ai/harness/runs/closeout-runner-guardrails/pre-fix.log
    - tasks/notes/20260716-0338-closeout-runner-guardrails.notes.md
  tests_pass:
    - path: tests/unit/closeout-runner-guardrails.test.ts
  commands_succeed:
    - bun run check:type
    - bun run check:helpers
    - bun scripts/capability-resolver.ts validate --format text
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
  qa_scores:
    - dimension: functionality
      min: 9
  manual_checks:
    - "Ordinary, verifier, and closeout helper timeout classes are fixed at 120s, 720s, and 900s respectively"
    - "The target start barrier publishes its PGID before execution, and both normal and hard-timeout paths use TERM then KILL for the complete descendant process group"
    - "One ship execution reaches Sprint verification passed exactly once through contract-worktree finish"
    - "Release verification and authoritative benchmark production share one Git-common-dir exclusive lock"
    - "No 3x9 benchmark matrix was executed for this guardrail package"
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: helper identity determines an immutable outer budget;
  process timeout owns all descendants; ship delegates verification; linked
  worktrees serialize expensive execution.
- Edge cases: ignored-TERM descendants; provider leaders that exit before their
  process group; stale/unsafe lock state; linked worktrees with distinct
  worktree git dirs; async provider-phase signal/failure cleanup; direct
  `verify-sprint` entry. Synchronous benchmark subprocess signal latency remains
  fail-closed: abnormal owner death leaves the non-reclaimable token for manual
  recovery.
- Regression risks: synchronous runner stdio/output/redaction parity and helper
  source/package projection parity.

## Rollback Point

- Commit / checkpoint: the single reviewed CRG-01 branch commit before merge.
- Revert strategy: revert that commit; no migration or dual runtime remains.
