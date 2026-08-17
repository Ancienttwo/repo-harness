> **Archived**: 2026-08-18 04:58
> **Related Plan**: plans/archive/plan-20260818-0334-worktree-runtime-bootstrap.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260818-0458

# Task Contract: worktree-runtime-bootstrap

> **Status**: Fulfilled
> **Plan**: plans/plan-20260818-0334-worktree-runtime-bootstrap.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-18 03:34
> **Review File**: `tasks/reviews/20260818-0334-worktree-runtime-bootstrap.review.md`
> **Notes File**: `tasks/notes/20260818-0334-worktree-runtime-bootstrap.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Every fresh contract worktree fails `check-architecture-sync.sh --strict`, and neither failure names
its cause. A missing dependency tree reads as `state=missing`, because the gate resolves the provider
through the candidate build (`bun src/cli/index.ts`), which requires archctx package-locally, while
the globally installed CLI resolves it elsewhere and reports `ready` -- so the obvious manual check
contradicts the gate. A missing code index reads as `unresolved-major-change` listing all eleven
capabilities, because archctx cannot prove a single flow without code facts, and the message mentions
neither codegraph nor code facts.

Skipped, every future slice re-derives that two-layer diagnosis. Shipped wrong -- by unconditionally
installing tooling -- it would opt adopters into codegraph indexing they deliberately declined.

## Goal

`contract-worktree start` seeds the gitignored runtime artifacts a new worktree needs, so a freshly
created contract worktree passes `check-architecture-sync.sh --strict` without manual repair, while
seeding only what the primary worktree has already adopted.

## Scope

- In scope: a `bootstrap_worktree_runtime` step in `start_worktree` across both paired copies
  (`scripts/contract-worktree.sh`, `assets/templates/helpers/contract-worktree.sh`); dependency
  install gated on a bun lockfile plus an available bun; codegraph indexing gated on the primary
  worktree already holding a `.codegraph/` directory; idempotence on worktree reuse; failure messages
  that name the downstream symptom; tests pinning all of it.
- Out of scope: the projection receipt store, which the first successful drain creates on its own;
  `.archcontext/generated`, which was investigated and ruled out (copying it from the primary changed
  nothing, and the gate is green without it); package managers other than bun; making the gate itself
  report a better message, which is a separate slice against `check-architecture-sync.sh`.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

Direction is wrong if seeding at start is the wrong layer -- for instance if worktrees are routinely
created outside this helper, or if indexing cost grows enough to make start feel broken. Cheapest
proof point: `codegraph init` on this repo took 657ms for 509 files, so the cost is currently noise;
re-measure if the repo grows an order of magnitude.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260818-0334-worktree-runtime-bootstrap.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260818-0334-worktree-runtime-bootstrap.review.md`
- Notes file: `tasks/notes/20260818-0334-worktree-runtime-bootstrap.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260818-0334-worktree-runtime-bootstrap.contract.md
  - tasks/reviews/20260818-0334-worktree-runtime-bootstrap.review.md
  - tasks/notes/20260818-0334-worktree-runtime-bootstrap.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/
  - tests/
  - scripts/contract-worktree.sh
  - assets/templates/helpers/contract-worktree.sh
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
    - tasks/notes/20260818-0334-worktree-runtime-bootstrap.notes.md
  tests_pass:
    - path: tests/unit/contract-worktree-runtime-bootstrap.test.ts
    - path: tests/unit/helper-projection-drift.test.ts
  commands_succeed:
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-task-sync.sh
```

## Verification Environment Note

`bash scripts/check-architecture-sync.sh` is deliberately NOT in `commands_succeed`. The bounded
verifier (`scripts/run-bounded-verifier-command.ts`) scrubs every `REPO_HARNESS_*` variable so harness
wiring cannot reach the command under verification, and it runs the command under
`bash --noprofile --norc`. archctx 0.4.3 needs Node 24; this machine's PATH resolves node v22.22.0,
and the only thing supplying Node 24 is the scrubbed `REPO_HARNESS_NODE_BIN`. The gate therefore
reports `state=error` inside the sandbox for every contract on this machine, independent of the change
under review, so it carries no signal there.

The gate is still enforced, just not from this list: the Stop hook runs the projection drain, and this
slice was verified against it directly on the rebased base (`state=ready blocking=0`). Making it
sandbox-runnable means giving the verification environment its own Node 24, which is a machine-level
change and a separate slice.

## Acceptance Notes (Human Review)

- Functional behavior: after `start`, a new worktree has `node_modules/` and (when adopted) a
  CodeGraph index, and `check-architecture-sync.sh --strict` reports `state=ready blocking=0`.
- Edge cases: primary without `.codegraph/` (skip, do not opt in); codegraph absent from PATH (skip);
  worktree reuse (no reinstall, no reindex); `codegraph init` failing (fail closed, message names the
  `unresolved-major-change` symptom); repo without a bun lockfile (skip the install).
- Regression risks: `start` now runs two external commands, so it is slower and can fail for
  environment reasons it previously ignored. That is intentional -- the alternative is a worktree
  that looks created but cannot pass a single gate. Measured cost on this repo: 166ms install,
  657ms index.

## Rollback Point

- Commit / checkpoint: branch `codex/worktree-runtime-bootstrap` off `bdc75c21`.
- Revert strategy: shell and test changes only; `git revert` the branch. No runtime state to unwind
  beyond gitignored artifacts a worktree can regenerate.
