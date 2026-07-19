# Task Contract: plan-status-fail-closed-and-runner-truth

> **Status**: Fulfilled
> **Plan**: plans/plan-20260720-0033-plan-status-fail-closed-and-runner-truth.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-20 01:20
> **Source Audit**: `docs/researches/20260716-gpt-5-6-prompt-guidance-harness-audit.md` (P0 items 1-2; slice 1)
> **Execution Base**: `origin/main@8254b2398ec8ad97bb5afd3e3655862b9f96a81d` (post-HRD-02 merge plus backfill and P0 promotion; this branch's fork point)
> **Sequencing**: between HRD rows — HRD-02 closed; HRD-03 must not start until this package merges and pins the post-fix SHA
> **Review File**: `tasks/reviews/20260720-0033-plan-status-fail-closed-and-runner-truth.review.md`
> **Notes File**: `tasks/notes/20260720-0033-plan-status-fail-closed-and-runner-truth.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Two audited P0 correctness defects make declared authority weaker than it
claims: a malformed or unrecognized plan status falls through both the
prompt decision table and the edit guard (fail open), and `contract-run`
parses delegation constraints it silently never enforces while its
`tool_calls` counter counts process launches under a false name. Every HRD
cutover row is parity-bound to the HRD-01 baseline, so no sprint row can fix
these; they persist until this package lands. Shipping wrong here weakens
the harness's central promise — that declared gates are real.

## Goal

Malformed/unknown plan status deterministically blocks implementation edits
at the edit boundary while the prompt layer stays advisory; every non-null
delegation constraint is either mechanically enforced or rejected at
preflight; the runner counter carries the honest name
`runner_invocations` with no alias; and the whole change is delivered with
positive/negative fixtures and a documented characterization-golden outcome.

## Scope

- In scope:
  - `src/cli/hook/prompt-guard-decision.ts`: the `unknown` plan-status
    branch (lines ~208-213) moves from silent `allow` to the conservative
    advisory/orientation action for all four execution actions — the prompt
    layer steers repair, it does not gain hard authority (audit LOOP-09
    boundary). Extend `tests/cli/prompt-guard-decision.test.ts` with
    positive/negative cases.
  - `assets/hooks/pre-edit-guard.sh` (canonical) + `bun run sync:hooks`
    projection to `.ai/hooks/pre-edit-guard.sh`: the plan-status `case`
    gains a fail-closed default branch — any status outside the known set
    produces a structured block naming the offending status and plan file.
    Known-good statuses behave exactly as today. Fixtures: malformed,
    empty, unrecognized, and each known-good status.
  - AMENDMENT (owner decision 2026-07-20, falsifier resolution): the known
    set's single authority is a new `statuses` array for plans in
    `.ai/harness/policy.json`, mirroring the existing prds/sprints shape,
    carrying the full observed legitimate vocabulary (the 11-value code
    union plus `Blocked` and `Review`, which live on three current real
    plans). The guard's default branch reads membership from that array;
    the default emission for newly initialized repos is added where
    prds/sprints statuses are already emitted
    (`scripts/lib/project-init-lib.sh` + helper mirror). The three legacy
    scattered lists (`pre-edit-guard` case arms, `validate_plan_transition`,
    `plan_terminal_status`) keep their current semantics untouched in this
    package; converging them into projections of the policy array is
    follow-up work, not this slice.
  - AMENDMENT (Stop-2 resolution): `docs/reference-configs/sprint-contracts.md`
    and its byte-parity mirror `assets/reference-configs/sprint-contracts.md`
    are renamed together in this package (the parity test
    `tests/sprint-backlog.test.ts` stays untouched and must stay green).
  - AMENDMENT (round-2 blocker resolution): `tests/runtime-profile-enforcement.test.ts`
    joins the named test surfaces — its shared `initRepo()` policy fixture
    gains the `active_plan.statuses` array, and its two fixtures that
    deliberately used `InProgress` to exploit the pre-fix fail-open switch
    to `Blocked` (now legitimate per the policy authority). Test intent is
    preserved; only the fixture adapts to the closed authority.
  - `scripts/contract-run.ts` + canonical mirror
    `assets/templates/helpers/contract-run.ts` (+ `bun run sync:helpers`):
    enforce-or-reject for every delegation constraint — `wall_time_minutes`
    enforced via the existing bounded process runner deadline;
    `tokens`, `network` (any value other than `inherited`), and
    `writable_paths` narrowing REJECTED at preflight with a clear message
    while unenforceable (no silent parse-to-noop); `tool_calls` →
    `runner_invocations` one-shot rename across parser, enforcement,
    report output, and messages, failing closed (clear error) when the old
    field name is present.
  - Rename ripple, same package, no alias: `.claude/templates/contract.template.md`
    + `assets/templates/contract.template.md`, scaffold emitters
    `scripts/plan-to-todo.sh`, `scripts/ensure-task-workflow.sh`,
    `scripts/lib/project-init-lib.sh` (+ their `assets/templates/helpers/`
    mirrors where they exist), docs
    `docs/reference-configs/sprint-contracts.md`,
    `docs/reference-configs/contract-brief-example.md`,
    `docs/reference-configs/contract-brief-example-bugfix.md`, and THIS
    package's own contract file's Delegation Contract block (bootstrap:
    the new parser must accept this very contract). Historical/archived
    contracts and the research audit text are records — do not rewrite.
  - Tests: extend `tests/contract-run.test.ts` (+
    `tests/helper-scripts.test.ts` where it pins the old name) with
    preflight-rejection and rename coverage; new
    `tests/plan-status-gate.test.ts` for the edit-guard fixtures if the
    existing hook test files are not the natural home.
  - Characterization outcome: run `tests/hook-runtime-characterization.test.ts`;
    if the frozen golden legitimately shifts (the fixture repo's
    PreToolUse.edit path), regenerate ONCE via
    `UPDATE_HOOK_RUNTIME_CHARACTERIZATION_GOLDEN=1` and record the exact
    before/after cell delta in the notes and PR body; if it does not shift,
    record that instead. Either outcome is acceptable; an undocumented one
    is not.
- Out of scope:
  - Any HRD row content; `src/effects/loop/`, `src/core/loop/`,
    `src/cli/hook/runtime.ts`, `route-registry.ts` untouched.
  - The `verify-contract` qa_scores dimension mismatch (separate todos row);
    the solo-operator external-acceptance policy decision (separate todos
    row); prompt slimming (audit slices ≥2).
  - Enforcing `tokens`/`network`/`writable_paths` mechanically in this
    package — the honest deliverable is reject-while-unenforceable; real
    enforcement arrives with the runner surfaces that can measure them.
  - Every path outside Allowed Paths; compatibility alias, dual field,
    fallback window, or silent migration.
- Taste constraints: the fail-closed default must name what it saw, not
  just "invalid"; rejection messages must say which constraint and why;
  the known-status list must have one authority, not a second copy in the
  guard.

## Stop Conditions

- Stop and hand back if the change would require editing a path outside
  Allowed Paths.
- Stop if the known-good plan-status set cannot be derived from one
  existing authority without inventing a second list.
- Stop if `wall_time_minutes` cannot ride the existing bounded runner
  without new process machinery.
- Stop if any existing test outside the named surfaces changes value
  (the characterization golden's documented one-shot is the sole
  exception).
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop after three fail -> fix -> reverify rounds for the same issue.

## Falsifier

The fail-closed direction is falsified if legitimate workflows routinely
carry plan statuses outside the known set (the block would fire on healthy
repos). Cheapest proof point: before implementing, grep the repo's own
plans/ (active + archive) and the LSC/HRD envelope history for every
`> **Status**:` value ever used; if statuses appear that the status
authority does not know, stop and report — the authority list, not the
guard, needs the decision first.

## Root Cause Evidence

Not applicable: `code-change` correctness package delivering fail-closed
behavior with fixtures; the audit + 2026-07-20 source re-verification are
the defect record (see plan Problem section for file:line).

- root_cause: (not applicable)
- repro: (not applicable)
- regression_guard: (not applicable)
- pre_fix_failure_artifact: (not applicable)

## Workflow Inventory

- Source audit: `docs/researches/20260716-gpt-5-6-prompt-guidance-harness-audit.md`
- Source plan: `plans/plan-20260720-0033-plan-status-fail-closed-and-runner-truth.md`
- Active plan: `plans/plan-20260720-0033-plan-status-fail-closed-and-runner-truth.md`
- Review file: `tasks/reviews/20260720-0033-plan-status-fail-closed-and-runner-truth.review.md`
- Notes file: `tasks/notes/20260720-0033-plan-status-fail-closed-and-runner-truth.notes.md`
- Checks file: `.ai/harness/checks/latest.json` (ignored runtime evidence)
- Run snapshots: `.ai/harness/runs/` (ignored runtime evidence)
- Base/branch/WT: `8254b2398ec8ad97bb5afd3e3655862b9f96a81d` /
  `codex/plan-status-fail-closed-and-runner-truth` /
  `/Users/kito/Projects/repo-harness-wt-plan-status-fail-closed-and-runner-truth`
- Scope gate: edit only paths listed under `allowed_paths`; update this
  contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract
  pass, the review recommend pass, and canonical `## External Acceptance
  Advice` record `pass` for the current review subject and benchmark evidence.
- CLI note: the global `repo-harness` binary is the packaged copy; run
  in-worktree verification through `bun src/cli/index.ts` / `bun test` so
  the renamed parser under test is this branch's code, not the installed
  package's.

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260720-0033-plan-status-fail-closed-and-runner-truth.md
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260720-0033-plan-status-fail-closed-and-runner-truth.contract.md
  - tasks/reviews/20260720-0033-plan-status-fail-closed-and-runner-truth.review.md
  - tasks/notes/20260720-0033-plan-status-fail-closed-and-runner-truth.notes.md
  - src/cli/hook/prompt-guard-decision.ts
  - assets/hooks/pre-edit-guard.sh
  - .ai/hooks/pre-edit-guard.sh
  - .ai/hooks/.projection.json
  - scripts/contract-run.ts
  - assets/templates/helpers/contract-run.ts
  - scripts/plan-to-todo.sh
  - assets/templates/helpers/plan-to-todo.sh
  - scripts/ensure-task-workflow.sh
  - assets/templates/helpers/ensure-task-workflow.sh
  - scripts/lib/project-init-lib.sh
  - assets/templates/helpers/lib/project-init-lib.sh
  - .claude/templates/contract.template.md
  - assets/templates/contract.template.md
  - docs/reference-configs/sprint-contracts.md
  - assets/reference-configs/sprint-contracts.md
  - .ai/harness/policy.json
  - docs/reference-configs/contract-brief-example.md
  - docs/reference-configs/contract-brief-example-bugfix.md
  - tests/cli/prompt-guard-decision.test.ts
  - tests/contract-run.test.ts
  - tests/helper-scripts.test.ts
  - tests/plan-status-gate.test.ts
  - tests/runtime-profile-enforcement.test.ts
  - tests/hook-runtime-characterization.test.ts
  - tests/fixtures/loop-runtime/characterization.json
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
    - src/cli/hook/prompt-guard-decision.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260720-0033-plan-status-fail-closed-and-runner-truth.notes.md
  tests_pass:
    - path: tests/cli/prompt-guard-decision.test.ts
    - path: tests/contract-run.test.ts
    - path: tests/hook-runtime-characterization.test.ts
  commands_succeed:
    - bun run check:type
    - bun run check:hooks
    - bun run check:helpers
    - bun run check:state-boundaries
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
    - "Every non-null delegation constraint is enforced or rejected at preflight"
    - "Characterization golden outcome is documented as unchanged or one-shot regenerated with the exact cell delta"
```

## Acceptance Notes (Human Review)

- Functional behavior: unknown/malformed status blocks at the edit guard
  with a structured reason; known statuses unchanged; preflight rejects
  unenforceable non-null constraints; `runner_invocations` is the only
  live name.
- Edge cases: empty status, whitespace status, casing variants, missing
  plan file (existing missing_artifact path unchanged); old `tool_calls`
  field in a contract fails closed with a clear message.
- Regression risks: over-broad blocking on healthy statuses (Falsifier
  covers), scaffold emitters drifting from the template, projection/mirror
  desync (check:hooks/check:helpers gate it).

## Rollback Point

- Commit / checkpoint: branch fork point `8254b2398ec8ad97bb5afd3e3655862b9f96a81d`
- Revert strategy: revert the single PR; guard, parser, templates, docs, and (if regenerated) the characterization golden revert as one unit.
