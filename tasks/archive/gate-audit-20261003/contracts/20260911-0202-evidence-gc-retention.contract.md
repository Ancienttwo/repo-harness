# Task Contract: evidence-gc-retention

> **Status**: Fulfilled
> **Plan**: plans/plan-20260911-0202-evidence-gc-retention.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-11 02:02
> **Review File**: `tasks/reviews/20260911-0202-evidence-gc-retention.review.md`
> **Notes File**: `tasks/notes/20260911-0202-evidence-gc-retention.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`.ai/harness/` grows without bound on two paths, and neither has an operator
exit. Whole-ledger evidence checkpoints reached 9.7 GB in a single repo on this
machine (~10.5 GB across eight) before manual cleanup. Retention for that landed
in `701aeebf` and ships in 0.19.0, but it only runs inside a successful publish,
so a repo whose ledger is gone (`publishCheckpointFromLedger` returns
`skipped: no-ledger`) or that never Stops again keeps the backlog forever with no
command to reclaim it. Separately, `stop-handler.ts:436` writes one run summary
per Stop that nothing ever deletes -- 5931 files here, back to 2026-05-25.

If this ships wrong, retention deletes durable evidence that shares the
directory: the snapshot `scripts/verify-sprint.sh:913-937` reads back during
acceptance finalization, or the ledger-bound record
`verification-execution.ts:507-510` reads as a `baseline_with_delta` baseline.
Either strands an acceptance with no operator recovery.

## Goal

Bound Stop run-summary growth at the writer, and give operators one command that
reclaims obsolete evidence in a repo the Stop path can no longer heal.

1. `src/effects/run-summary-retention.ts` owns one retention policy: delete only
   records with the run-summary shape -- a non-empty `run_id` plus string
   `checks_file`, `handoff_file`, `policy_file`, and `context_map_file` -- keeping
   the newest `RUN_SUMMARY_RETENTION_COUNT` by mtime. The discriminator is the
   shape, not `reason`: that field is free-form operator text. Every other shape
   in the directory belongs to its own owner and is never a candidate.
2. `stop-handler.ts` applies that sweep after its own run-summary write, fail-open
   so a sweep fault never fails Stop.
3. `repo-harness run evidence-gc [--dry-run] [--repo <path>]` applies the same
   sweep plus the existing `pruneCheckpointCache`, and reports reclaimable bytes
   per class.

## Scope

- In scope: `src/effects/run-summary-retention.ts` (new),
  `src/cli/hook/stop-handler.ts` (one call site), `scripts/evidence-gc.ts` (new)
  and its helper registration in `assets/workflow-contract.v1.json`,
  `.ai/harness/workflow-contract.json`, and `src/cli/commands/run.ts`; focused
  tests; upgrade documentation for pre-0.19.0 backlogs in
  `assets/reference-configs/`. Also `workflow_write_run_summary`'s jq-less
  branch in `assets/hooks/lib/workflow-state.sh`: it writes the same record this
  contract now identifies by shape, and its short fallback would make every
  jq-less host's summaries permanently unreclaimable. Also the root `CLAUDE.md`
  and `AGENTS.md` `Required Checks` block, which omitted `check:reference-configs`
  -- the third member of the projection-drift family this contract trips.
- Out of scope: `src/effects/hook-event-log.ts` retention constants. The 256 MB /
  32-segment archive cap is already bounded and works as designed; the operator
  decided this round not to change it. Also out of scope: any change to the
  checkpoint projection shape or to `collectObsoleteCheckpoints` itself -- this
  task exposes the existing policy, it does not redefine it.
- Taste constraints: no new `policy.json` surface. The retention bound is an
  exported constant, matching `HOOK_LOG_ARCHIVE_SEGMENTS`, because no second
  consumer has asked to tune it.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if a file in `harness.runs_dir` that some reader depends
on can carry the run-summary shape, or if a genuine run summary can lack one of
its four path fields and so become permanently unreclaimable. Cheapest proof
point: enumerate every writer into `runs_dir` across `src/`, `scripts/`, and
`assets/hooks/`, and for each one read the record shape it emits on every branch.

Executed. Four writers of a `${runId}.json`-style record:

- `stop-handler.ts:470-482` -- the disposable run summary, all eleven fields.
- `workflow_write_run_summary` (`assets/hooks/lib/workflow-state.sh:1314`) --
  the same eleven fields and the larger producer by volume. Its jq-less branch
  emitted only five; this contract fixes that, because a short branch would make
  every jq-less host's summaries permanently unreclaimable.
- `verify-sprint.sh:1009` -- `schema: repo-harness-run-trace.v1`, read back at
  finalization (`:913-937`). Carries `run_id`, none of the four path fields.
- `verification-execution.ts:919-921` -- `kind: verification_execution_record`,
  ledger-bound by sha256, read at `readValidRunResult:507-510`. No `run_id` at
  all, so the discriminator rejects it on its first test.

Operator reports in the same directory carry neither `run_id` nor the path
fields. Measured on this repository's live directory: 5898 run summaries, 33
verify-sprint traces, 12 operator reports, zero partial-shape records.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear as a `package_test` check in Verification Plan).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260911-0202-evidence-gc-retention.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260911-0202-evidence-gc-retention.review.md`
- Notes file: `tasks/notes/20260911-0202-evidence-gc-retention.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"retention-and-gc-tests","kind":"deterministic_test","paths":["*"]},{"id":"evidence-gc-cli-readback","kind":"runtime_readback","paths":["scripts/evidence-gc.ts","assets/workflow-contract.v1.json",".ai/harness/workflow-contract.json","src/cli/commands/run.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260911-0202-evidence-gc-retention.contract.md
  - tasks/reviews/20260911-0202-evidence-gc-retention.review.md
  - tasks/notes/20260911-0202-evidence-gc-retention.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/
  - tests/
  - scripts/
  - assets/workflow-contract.v1.json
  - assets/templates/helpers/
  - assets/hooks/
  - assets/reference-configs/
  - .ai/hooks/
  - .ai/harness/workflow-contract.json
  - docs/
  - CLAUDE.md
  - AGENTS.md
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

This block contains only non-executable artifact requirements. Define every
executable check once in the canonical Verification Plan below. Each check must
state its phase, cost, evidence policy, necessity, and input environment; a
missing or malformed plan fails closed.

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260911-0202-evidence-gc-retention.notes.md
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "focused-regression",
      "kind": "package_test",
      "path": "tests/unit/run-summary-retention.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Covers the changed behavior named by this contract.",
      "inputs": { "env": [] }
    },
    {
      "id": "stop-retention-wiring",
      "kind": "package_test",
      "path": "tests/stop-handler.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Proves the Stop call site keeps a checks-pinned acceptance snapshot and never fails Stop on a retention fault.",
      "inputs": { "env": [] }
    },
    {
      "id": "run-summary-shape-authority",
      "kind": "package_test",
      "path": "tests/workflow-state-lib.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Proves both branches of the shell run-summary writer emit the shape retention identifies, so a jq-less host is not permanently unreclaimable.",
      "inputs": { "env": [] }
    },
    {
      "id": "reference-config-projection-drift",
      "kind": "command",
      "command": "bun run check:reference-configs",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "This contract edits assets/reference-configs/; the check is the drift gate for that projection pair.",
      "inputs": { "env": [] }
    },
    {
      "id": "helper-projection-drift",
      "kind": "command",
      "command": "bun run check:helpers",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "A new helper edits both scripts/ and its assets/ projection; this check is the drift gate for that pair.",
      "inputs": { "env": [] }
    },
    {
      "id": "hook-projection-drift",
      "kind": "command",
      "command": "bun run check:hooks",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "stop-handler.ts is a hook path with a generated projection; this check catches a projection edited without its source.",
      "inputs": { "env": [] }
    },
    {
      "id": "typecheck",
      "kind": "command",
      "command": "bun run check:type",
      "cwd": ".",
      "phase": "preflight",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Checks TypeScript contracts before behavioral verification.",
      "inputs": { "env": [] }
    }
  ]
}
```

This is the sole executable verification authority. Use `baseline_with_delta`
only when a referenced immutable baseline plus named current delta checks prove
the intended coverage; do not infer that choice from paths or command text.

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
