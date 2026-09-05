> **Archived**: 2026-09-05 23:15
> **Related Plan**: plans/archive/plan-20260905-1414-operator-server-write-gate.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: run-20260905-2315
> **Archive Projection V1**: `plans/plan-20260905-1414-operator-server-write-gate.md` => `plans/archive/plan-20260905-1414-operator-server-write-gate.md`
> **Archive Projection V1**: `tasks/notes/20260905-1414-operator-server-write-gate.notes.md` => `tasks/archive/notes-20260905-2315-operator-server-write-gate.md`
> **Archive Projection V1**: `tasks/contracts/20260905-1414-operator-server-write-gate.contract.md` => `tasks/archive/contract-20260905-2315-operator-server-write-gate.md`
> **Archive Projection V1**: `tasks/reviews/20260905-1414-operator-server-write-gate.review.md` => `tasks/archive/review-20260905-2315-operator-server-write-gate.md`

# Task Contract: operator-server-write-gate

> **Status**: Fulfilled
> **Plan**: plans/archive/plan-20260905-1414-operator-server-write-gate.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-05 14:14
> **Review File**: `tasks/archive/review-20260905-2315-operator-server-write-gate.md`
> **Notes File**: `tasks/archive/notes-20260905-2315-operator-server-write-gate.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`
> **Substantive Change SHA256**: `sha256:823b80ff4f808689792de8371a84ff0c4eb6950c5a2c80556aef7393ce2ed6f1`

## Why

The operator board's standing boundary is that a browser has exactly one write.
That claim was only ever probed, never structural: `OPERATOR_ROUTES` had zero
consumers, so a route added without declaring it went uncaught, and the one
declared write had no admission bound and no media-type check. Around the same
boundary, a page reload landing inside the Fleet collector's abort drain was
answered with a spurious 503, a case-variant API path returned the SPA shell
instead of a JSON 404, and every refusal was silent, so an operator watching a
board that dropped writes had nothing to look at.

## Goal

Make the single-write boundary structural and harden the transport around it:
retire the shared Fleet observation at cancellation rather than at settlement,
gate the route inventory with a test that counts writes against the values the
dispatcher matches on, bound and type-check the one write route, assert the
collaboration snapshot echoes the requested repository id, claim the API prefix
case-insensitively, and close the header and observability gaps.

## Scope

- In scope:
  - `src/effects/operator/server.ts`: exported route matchers and the inventory
    built from them, in-flight clear at cancellation, write admission bound,
    415 on a non-JSON write, case-insensitive API prefix, CSP `base-uri` and
    `form-action`, `Allow` on 405, one stderr line per refusal.
  - `src/effects/operator/collaboration.ts`: the exported snapshot identity
    assertion and its use on both sides of the collaboration worker boundary.
  - `tests/cli/operator-serve.test.ts` and
    `tests/effects/operator-write-boundary.test.ts`: the regression guards.
- Out of scope:
  - any change to the Fleet collector, task inbox, browser UI, or Windows job controller.
- Taste constraints: keep every refusal a fixed public sentence; the transport
  keeps the typed code and drops the diagnostic text, paths, headers, and Origin.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If retiring the shared Fleet observation at cancellation let two collections run
concurrently against one board, the direction is wrong: the point of the shared
in-flight promise is that concurrent readers coalesce. Cheapest proof point:
`tests/cli/operator-serve.test.ts` already asserts that two simultaneous
snapshot requests produce exactly one collector call, and that a third request
after both settle produces the next sequence. Both still hold, because the
cancel path only runs when the subscriber count has already reached zero.

## Root Cause Evidence

- root_cause: `src/effects/operator/server.ts` cleared `inFlight` and `activeFleetCanceller` only in the settlement handlers of the shared snapshot promise, so between a sole subscriber's disconnect (which aborts the collection) and that collection actually settling — the collector drains a 500 ms cleanup grace period and then waits up to 5 s for its process group to disappear — every arriving request was handed the dying promise and answered with its failure.
- repro: `bun src/cli/index.ts operator serve --port 0`, then `curl --max-time 0.15 $URL/api/v1/fleet/snapshot` to abort a started collection and immediately `curl -i $URL/api/v1/fleet/snapshot`; before the fix the second request answered 503 with the first one's failure.
- regression_guard: tests/cli/operator-serve.test.ts
- pre_fix_failure_artifact: .ai/harness/evidence/pre-fix/operator-serve.test.log

## Workflow Inventory

- Source plan: `plans/archive/plan-20260905-1414-operator-server-write-gate.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260905-2315-operator-server-write-gate.md`
- Notes file: `tasks/archive/notes-20260905-2315-operator-server-write-gate.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"operator-server-write-gate-deterministic","kind":"deterministic_test","paths":["*"]},{"id":"operator-server-write-gate-loopback-probe","kind":"runtime_readback","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/archive/plan-20260905-1414-operator-server-write-gate.md
  - tasks/todos.md
  - tasks/archive/contract-20260905-2315-operator-server-write-gate.md
  - tasks/archive/review-20260905-2315-operator-server-write-gate.md
  - tasks/archive/notes-20260905-2315-operator-server-write-gate.md
  - src/effects/operator/server.ts
  - src/effects/operator/collaboration.ts
  - src/cli/commands/operator.ts
  - tests/
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
    fallback: null
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - src/effects/operator/server.ts
    - src/effects/operator/collaboration.ts
  artifacts_exist:
    - tasks/archive/notes-20260905-2315-operator-server-write-gate.md
    - .ai/harness/evidence/pre-fix/operator-serve.test.log
  tests_pass:
    - path: tests/cli/operator-serve.test.ts
    - path: tests/effects/operator-write-boundary.test.ts
    - path: tests/effects/operator-task-message.test.ts
    - path: tests/effects/fleet-collector-process.test.ts
    - path: tests/cli/collaboration.test.ts
  commands_succeed:
    - bun run check:type
    - bun run build:operator-web
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - bash scripts/check-task-workflow.sh --strict
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

- Functional behavior: a reload arriving inside the collector's abort drain gets
  a fresh 200 collection; the inventory declares exactly one write and its
  patterns are the dispatcher's own; a second concurrent write above
  `max_concurrency` gets 503 `task_message_busy` with `Retry-After`; a non-JSON
  write gets 415; a collaboration snapshot that does not echo the requested id
  gets a typed 500; `/API/...` is a JSON 404; the static CSP carries `base-uri`
  and `form-action`; every 405 carries `Allow`; every non-2xx writes one stderr
  line and stdout stays the single bound-URL line.
- Edge cases: Origin checks stay ahead of the media-type check, so a foreign
  Origin with `text/plain` is still 403 and never 415; Node keeps the first
  `content-type` value and drops later duplicates, so a duplicated header cannot
  widen the gate — a non-JSON first value is refused with 415, and a JSON first
  value still has to pass the body decoder; the refusal path is
  JSON-quoted and truncated to 200 characters so a control character in the
  request target cannot forge a second log line.
- Regression risks: the write admission bound is new refusal behavior on a route
  that previously accepted unbounded concurrency; the browser only ever has one
  send in flight, and the cap defaults to 4.

## Rollback Point

- Commit / checkpoint: main 1a9a5ae1 (branch base)
- Revert strategy: revert the branch's commits on `codex/operator-server-write-gate`
  together; the server change and its guards share one rollback surface.
