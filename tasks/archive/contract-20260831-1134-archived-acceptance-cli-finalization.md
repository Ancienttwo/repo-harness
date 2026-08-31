> **Archived**: 2026-08-31 11:34
> **Related Plan**: plans/archive/plan-20260831-0937-archived-acceptance-cli-finalization.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260831-1134

# Task Contract: archived-acceptance-cli-finalization

> **Status**: Fulfilled
> **Plan**: plans/plan-20260831-0937-archived-acceptance-cli-finalization.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-31 09:37
> **Review File**: `tasks/reviews/20260831-0937-archived-acceptance-cli-finalization.review.md`
> **Notes File**: `tasks/notes/20260831-0937-archived-acceptance-cli-finalization.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The official archived acceptance CLI currently cannot complete the same workflow that its library primitives support: it reopens the canonical live contract path after that file has moved into the archive, then can leave the archive seal stale by projecting the review after sealing. Operators must not need a manual ledger import and reseal sequence to finish a valid archived work-package.

## Goal

Make `acceptance-receipt record` complete an archived projected acceptance through one public CLI invocation while preserving canonical AcceptanceReceipt identity, importing evidence from the exact selected archived contract, and leaving the final projected family freshly sealed.

## Scope

- In scope: explicit selected-contract provenance at the CLI-to-ledger boundary; terminal archive reseal after optional review projection; source/template parity; CLI E2E regression coverage.
- Out of scope: automatic architecture decisions, provider apply, archive discovery or fallback, compatibility aliases, receipt identity changes, and the separate R1 provider-neutral Agent Runtime worktree.
- Taste constraints: keep canonical receipt authority and selected artifact provenance separate and explicit; fail closed rather than rediscovering or substituting paths.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If an archived CLI fixture already imports a human-acceptance event and verifies the post-projection archive seal without manual steps, the proposed boundary change is unnecessary. The focused CLI regression is the cheapest proof point.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `scripts/acceptance-receipt.ts:1241-1279` imports ledger authority from canonical `receipt.contract_file` even when the validated `--contract` is its archived projection, and `scripts/acceptance-receipt.ts:1342-1344` projects review bytes after `writeAcceptanceWithArchiveProjection` has sealed them.
- repro: `bun test tests/evidence-attested-import.test.ts -t "archived user waiver imports selected contract and leaves projection sealed"`.
- regression_guard: tests/evidence-attested-import.test.ts
- pre_fix_failure_artifact: tasks/notes/20260831-0937-archived-acceptance-cli-finalization.pre-fix.log

## Workflow Inventory

- Source plan: `plans/plan-20260831-0937-archived-acceptance-cli-finalization.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260831-0937-archived-acceptance-cli-finalization.review.md`
- Notes file: `tasks/notes/20260831-0937-archived-acceptance-cli-finalization.notes.md`
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
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260831-0937-archived-acceptance-cli-finalization.contract.md
  - tasks/reviews/20260831-0937-archived-acceptance-cli-finalization.review.md
  - tasks/notes/20260831-0937-archived-acceptance-cli-finalization.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - assets/templates/helpers/acceptance-receipt.ts
  - scripts/acceptance-receipt.ts
  - src/
  - tests/
  - tasks/notes/20260831-0937-archived-acceptance-cli-finalization.pre-fix.log
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
    - tasks/notes/20260831-0937-archived-acceptance-cli-finalization.notes.md
  tests_pass:
    - path: tests/evidence-attested-import.test.ts
  commands_succeed:
    - cmp scripts/acceptance-receipt.ts assets/templates/helpers/acceptance-receipt.ts
    - bun test --timeout 60000
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

- Functional behavior: one CLI record invocation imports exactly one attested event and leaves `verify` passing for the archived family.
- Edge cases: canonical live contract is absent; selected archived contract is committed and exact; optional review projection changes sealed bytes.
- Regression risks: ledger subject identity must continue to bind the actual authority bytes while AcceptanceReceipt retains the canonical live path.

## Rollback Point

- Commit / checkpoint: work-package branch before merge.
- Revert strategy: revert CLI provenance/reseal wiring, mirrored helper, focused tests, and this workflow package as one unit.
