> **Archived**: 2026-08-20 20:42
> **Related Plan**: plans/archive/plan-20260820-1902-envelope-pin-mergegate-leakscan.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260820-2042

# Task Contract: envelope-pin-mergegate-leakscan

> **Status**: Fulfilled
> **Plan**: plans/plan-20260820-1902-envelope-pin-mergegate-leakscan.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-20 19:02
> **Review File**: `tasks/reviews/20260820-1902-envelope-pin-mergegate-leakscan.review.md`
> **Notes File**: `tasks/notes/20260820-1902-envelope-pin-mergegate-leakscan.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Two verified-but-unasserted quoting properties (`advanceCommand` single-quote escaping; `shellArgv` only understanding single-quoted words) can silently regress: a future edit passes CI while the envelope emits commands that real bash parses differently than the conformance driver. Separately, merge-gate verifies semantics and evidence but never scans the staged diff, so an ordinary merge can seal and ship a credential or private path — the only machine leak gate today covers ChatGPT delegation bundles only.

## Goal

Three deliverables, closing three `tasks/todos.md` ledger rows:
1. A standing test in `tests/continuation-envelope.test.ts` that round-trips an adversarial Task-cell corpus (embedded `'`, `'\''`, spaces/tabs, `$(...)`, backticks, `"`, backslashes, `;`, `&&`, leading `-`) through the projected `advance_sprint` command and a real spawned `bash` argv-echo, asserting the recovered `--task` argument is byte-identical and no injection artifact appears as a separate argv token.
2. A tripwire inside `shellArgv()` (`tests/continuation-conformance.test.ts:363-407`): unquoted `"` or unquoted newline fails loudly via `expect(...)` in the same style as the existing unterminated-quote assertion. Do NOT complete the parser into full POSIX.
3. A leak-pattern scan in `scripts/merge-gate.ts` `run` path, after `candidate()` and before `writeSeal`: added diff lines checked against a small in-repo credential pattern set (PEM private-key headers, AWS `AKIA[0-9A-Z]{16}`, GitHub `ghp_`/`gho_`/`github_pat_`, Slack `xox[baprs]-`, npm `_authToken`) and `changedFiles` checked against private-path patterns (`_ops/` prefixes, `/Users/<name>/` home paths as tracked paths). Any hit → `fail()` naming pattern id and file with the matched secret redacted, before any seal is written. Scanner malfunction is also `fail()` (fail closed). No allowlist, no suppression, no new policy key. Identical change mirrored into `assets/templates/helpers/merge-gate.ts`.

## Scope

- In scope: `tests/continuation-envelope.test.ts`, `tests/continuation-conformance.test.ts`, `scripts/merge-gate.ts`, `assets/templates/helpers/merge-gate.ts`, `tests/merge-gate.test.ts`, closing the three ledger rows in `tasks/todos.md`, contract/review/notes artifacts.
- Out of scope: full POSIX `shellArgv` parser; Gitleaks or any external scanner dependency in merge-gate; allowlist/suppression surfaces; policy.json changes; the ChatGPT delegation-bundle secret scan; every other ledger row (ESA-06, Lite phase-3, evals ownership stay deferred).
- Taste constraints: match existing test/file conventions; patterns anchored and precise over broad (false positives block merges).

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If the existing 12/12 argv-identical property does not actually hold (the pin test finds a real bash mismatch on some corpus string), the direction is wrong-side-up: that is a live envelope bug, not a pin — stop and report instead of adjusting the corpus to pass. Cheapest proof point: run the new pin test before touching anything else.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260820-1902-envelope-pin-mergegate-leakscan.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260820-1902-envelope-pin-mergegate-leakscan.review.md`
- Notes file: `tasks/notes/20260820-1902-envelope-pin-mergegate-leakscan.notes.md`
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
  - tasks/contracts/20260820-1902-envelope-pin-mergegate-leakscan.contract.md
  - tasks/reviews/20260820-1902-envelope-pin-mergegate-leakscan.review.md
  - tasks/notes/20260820-1902-envelope-pin-mergegate-leakscan.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/
  - tests/
  - scripts/merge-gate.ts
  - assets/templates/helpers/merge-gate.ts
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
    - tasks/notes/20260820-1902-envelope-pin-mergegate-leakscan.notes.md
  tests_pass:
    - path: tests/continuation-envelope.test.ts
    - path: tests/continuation-conformance.test.ts
    - path: tests/merge-gate.test.ts
  commands_succeed:
    - bun run check:type
    - bun src/cli/index.ts init --repo . --dry-run
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
