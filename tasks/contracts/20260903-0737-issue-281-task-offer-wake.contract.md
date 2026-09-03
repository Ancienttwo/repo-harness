# Task Contract: issue-281-task-offer-wake

> **Status**: Fulfilled
> **Plan**: plans/plan-20260903-0737-issue-281-task-offer-wake.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-03 07:37
> **Review File**: `tasks/reviews/20260903-0737-issue-281-task-offer-wake.review.md`
> **Notes File**: `tasks/notes/20260903-0737-issue-281-task-offer-wake.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The Agent Runtime effect protocol can notify an Engineer about one exact persisted message, but an idle
persistent Engineer whose offer set turns from empty to actionable has no repository-owned way to learn
that work exists. Without a durable wake seam, an unattended controller must busy-poll every repository or
grow a host-specific wake path outside the harness, and a host-specific path is exactly where notification
silently becomes authority to claim. If this ships wrong the wake becomes a second scheduling authority:
a host action carrying claim tokens, or an exit code accepted as proof that a controller step ran.

## Goal

Extend the provider-neutral Agent Runtime effect protocol with a durable `wake_for_offer` operation:
`AgentRuntimeOperation = 'notify_inbox' | 'wake_for_offer'`, a wake intent bound to the exact Engineer,
Binding ID + generation + Engineer contract revision, repository ID + authorization revision,
`EngineerOffersV1.snapshot_revision`, a closed wake reason, the host/adapter endpoint fence, an idempotency
key, a creation timestamp and a canonical digest; exactly one durable wake intent on the empty to eligible
transition; same-snapshot idempotency; deterministic newer-snapshot supersession and bounded debounce
coalescing that keeps the newest revision; Binding replacement/retirement, capability downgrade and
authorization change failing before any host action; a host action carrying no claim token or writable
authority; success proven only by a controller-step receipt bound to the effect control reference; both
adapters implementing the operation or returning a typed `unsupported`; a non-CLI effect-level subscription
seam; and observational board/Operator projection.

## Scope

- In scope: `src/core/engineers/agent-runtime-effect.ts` (operation union, wake intent/host action, controller-step
  receipt, pure offer-transition observer, capability operation matrix); `src/effects/engineers/agent-runtime-effect-store.ts`
  (durable per-Binding wake ledger, prepare/start/observe for wake, supersession, coalescing, receipt binding,
  subscription seam); the two Agent Runtime adapters; `engineering-overlay` wake projection; `engineer runtime-effect`
  CLI verbs; `docs/spec.md`; the agent-runtime-effects architecture module and ArchContext node; focused tests.
- Out of scope: Work Package selection or claim authority in the runtime effect; acquisition from the host adapter;
  the controller loop (#279) and acquire-next (#280); task identity (#283); dependency authority (#284); automation
  budget (#282); lease liveness (#286); attempt receipts (#287) — `retry_due` stays a closed enum slot no observer emits.
- Taste constraints: match the existing dense single-statement style of the two runtime files; no new module for
  behaviour that belongs inside the protocol this issue extends.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if a wake can authorize acquisition. Cheapest proof point: build a wake host action and
assert its canonical bytes contain no claim id, lease generation, task id or offer body, and that
`observeAgentRuntimeEffect` on a wake effect refuses to reach `observed_success` from an accepted adapter outcome
plus a message-delivery receipt alone — only a controller-step receipt carrying this effect's exact control
reference may close it. A second falsifier: if two wake intents can be durable at once for one Binding, the
coalescing model is wrong.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260903-0737-issue-281-task-offer-wake.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260903-0737-issue-281-task-offer-wake.review.md`
- Notes file: `tasks/notes/20260903-0737-issue-281-task-offer-wake.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"issue-281-wake-deterministic","kind":"deterministic_test","paths":["*"]},{"id":"issue-281-wake-runtime-readback","kind":"runtime_readback","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - docs/architecture/
  - plans/plan-20260903-0737-issue-281-task-offer-wake.md
  - tasks/todos.md
  - tasks/contracts/20260903-0737-issue-281-task-offer-wake.contract.md
  - tasks/reviews/20260903-0737-issue-281-task-offer-wake.review.md
  - tasks/notes/20260903-0737-issue-281-task-offer-wake.notes.md
  - .archcontext/model/
  - AGENTS.md
  - CLAUDE.md
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
    - plans/plan-20260903-0737-issue-281-task-offer-wake.md
  artifacts_exist:
    - tasks/contracts/20260903-0737-issue-281-task-offer-wake.contract.md
    - tasks/reviews/20260903-0737-issue-281-task-offer-wake.review.md
    - tasks/notes/20260903-0737-issue-281-task-offer-wake.notes.md
  tests_pass:
    - path: tests/unit/issue-281-task-offer-wake.test.ts
    - path: tests/unit/r1-provider-neutral-agent-runtime.test.ts
    - path: tests/unit/r1-agent-runtime-adapters.test.ts
    - path: tests/cli/engineer.test.ts
    - path: tests/cli/mcp-engineer-tools.test.ts
  commands_succeed:
    - bun test --timeout 60000
    - bun run check:type
    - bun run check:state-boundaries
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
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
