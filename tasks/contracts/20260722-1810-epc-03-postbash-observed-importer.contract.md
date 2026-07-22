# Task Contract: epc-03-postbash-observed-importer

> **Status**: Done
> **Plan**: plans/plan-20260722-1810-epc-03-postbash-observed-importer.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Reviewer**: Claude
> **Waiver Policy**: user_waiver allowed, owner kito only, per Acceptance Policy below
> **Base SHA**: `8861b40dd85c0f7faabe8eecd217baf5528a7f3c` (pinned per R1 post-EPC-02: fresh fetch after PR #118 merged, plus its row-flip commit `docs(program): mark epc-02 done via PR #118; EPC-03/04 wave unblocked`; verified equal to this worktree's HEAD at task start)
> **Target Branch**: main (via one independent PR)
> **Working Branch**: `codex/epc-03-postbash-observed-importer`
> **PR Unit**: one PR carrying the importer module, the `command-observed.ts` wiring edit, the test suite, and this package's workflow artifacts
> **Capability ID**: root
> **Last Updated**: 2026-07-22 18:10
> **Review File**: `tasks/reviews/20260722-1810-epc-03-postbash-observed-importer.review.md`
> **Notes File**: `tasks/notes/20260722-1810-epc-03-postbash-observed-importer.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

EPC-03 implements Sprint C backlog row 7: the PostBash observed importer.
PostBash command observations are imported into the EPC-01 ledger as
`observed` trust-class events only; an observed-only ledger provably leaves
machine gates unsatisfied (D4). Emission is additive: the existing
`checks/post-bash-latest.json` write is untouched (pre-epoch legacy surface
per D2; no cutover assigned to this row). The trust matrix (D4) is only
meaningful if the `observed` class exists in practice: rows 9-12 must
demonstrate that ubiquitous low-trust telemetry (every Bash command) flows
into the same ledger yet can never satisfy a gate.

## Goal

1. `src/effects/evidence/post-bash-importer.ts`: imports one PostBash
   observation as ONE `observed` event via the EPC-01 writer
   (`appendEvidenceEvent`/`appendGenesisRecord`), genesis via
   `LEDGER_EPOCH_START_SHA` (EPC-02's epoch constant, imported read-only).
   Trust class is hard-coded `observed`; the module's public input type
   carries no trust-class field at all, so no code path can emit any other
   class. Subject identity: `base_commit`/`target_commit` computed from
   repo state (git rev-parse against the resolved review-base ref and
   `HEAD`); `authority_commit`/`scope_hash`/`contract_hash` bound to the
   active contract when one exists and is committed-clean, else the
   literal sentinel `unbound` -- legal ONLY for `observed` (enforced by
   this module never accepting a caller-supplied trust class). Repo-state
   fields also degrade to `unbound` when git cannot resolve them (e.g. a
   non-git fixture directory), for the same reason: an `observed` event
   can never satisfy a gate regardless of its identity fields (D4), so
   there is no safety reason to refuse. `env_provider_id` follows the
   existing `provider/provider_cli_version/workspace_id` construction
   (pattern reference: `verify-producer.ts`). Payload is a small
   structured summary only: a short (16-hex-char) command-hash prefix,
   `exit_code`, `duration_ms`, and a short (24-char) raw-output reference
   -- never the raw output bytes, and never a full hash or full path
   verbatim, both of which are 32+ char dot-free runs that EPC-01's D6
   redaction over-redacts into a useless double-hash (`/` is inside the
   redaction charset, so a realistic repo-relative path does not survive
   unmangled either).
2. Wire `src/cli/hook/command-observed.ts`: after the existing
   `post-bash-latest.json` write, import the same observation into the
   ledger. Failure semantics MATCH the existing write path's behavior
   exactly: the import call sits inside the same `try` block, and a
   failure result is turned into a thrown `Error`, caught by the same
   pre-existing `catch` that already handles every other failure in this
   function -- same exit code (`1`), same `reason` (`write-failed`), same
   `[PostBash] <message>` stderr convention. No new fallback, no new
   severity, no new stdout messaging on success.
3. `tests/evidence-post-bash-importer.test.ts`, red-first (confirmed: the
   suite fails with "Cannot find module" before the implementation
   existed): observed trust class with the complete D3 field set;
   unclean/absent/untracked contract produces `unbound` identity fields,
   a clean committed contract produces bound ones; an observed-only
   ledger's accepted fold filtered for `authoritative_machine` is empty;
   malformed input (non-integer `exitCode`, negative `durationMs`, an
   absolute or path-traversal `rawOutputPath`) fails closed with nothing
   appended; identical re-import dedups to one accepted event via the
   idempotency key; genesis is written once with `LEDGER_EPOCH_START_SHA`.
4. All root required checks green; one independent PR on
   `codex/epc-03-postbash-observed-importer`.

## Scope

- In scope: `src/effects/evidence/post-bash-importer.ts`,
  `src/cli/hook/command-observed.ts` (wiring edit only),
  `tests/evidence-post-bash-importer.test.ts`, this package's
  plan/contract/review/notes, `tasks/todos.md` projection,
  `.ai/harness/worktrees/epc-03-postbash-observed-importer.json`.
- Out of scope: every EPC-01/EPC-02 file (`src/core/evidence/*`,
  `src/effects/evidence/*` existing files including `epoch.ts` and
  `verify-producer.ts` -- read-only imports/pattern reference only),
  `scripts/acceptance-receipt.ts` and every other EPC-04 surface
  (`assets/templates/helpers/acceptance-receipt.ts`,
  `src/effects/evidence/attested-import.ts`,
  `tests/evidence-attested-import.test.ts`), `checks/latest` or
  `post-bash-latest` composition, any gate logic, handoff writers,
  `tasks/current.md`, the sprint document, any new npm dependency.
- Non-goals: retiring `post-bash-latest.json`; subject-strict binding for
  observed events; gate cutover.
- Taste constraints: match the existing `core`/`effects` idiom (readonly
  interfaces, `{ ok, ... }`/discriminated-union result shapes, plain
  exported functions, no classes, no barrel `index.ts`); smallest diff
  that satisfies the frozen D2-D6 decisions; private per-producer
  git/contract helpers, not shared with `verify-producer.ts` (R4).

## Stop Conditions

- Stop and hand back to the parent if `origin/main` has moved past
  `8861b40dd85c0f7faabe8eecd217baf5528a7f3c` before this package's
  worktree was created -- re-fetch and re-audit, never silently re-pin.
- Stop and hand back to the parent if correct emission would require
  modifying an EPC-01/EPC-02 module or touching any EPC-04 surface --
  report instead of widening scope silently.
- Stop if `check-architecture-sync` BLOCKS (not merely advises) on the
  changed capability surfaces -- report rather than editing
  `.ai/context/` or architecture files.
- Stop after three fail-fix-reverify rounds on one issue.

## Falsifier

The direction is wrong if observed import cannot reuse the EPC-01 writer
without schema changes, or if the observed-only-unsatisfied fixture cannot
be expressed with the existing fold primitives. Cheapest proof: the
fixture filtering accepted events for `authoritative_machine` over an
observed-only ledger returns empty, and the full suite stays green.

## Root Cause Evidence

Not applicable: Task Profile is `code-change`, not `bugfix`.

## Workflow Inventory

- Source plan: `plans/plan-20260722-1810-epc-03-postbash-observed-importer.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260722-1810-epc-03-postbash-observed-importer.review.md`
- Notes file: `tasks/notes/20260722-1810-epc-03-postbash-observed-importer.notes.md`
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
  - plans/plan-20260722-1810-epc-03-postbash-observed-importer.md
  - tasks/contracts/20260722-1810-epc-03-postbash-observed-importer.contract.md
  - tasks/reviews/20260722-1810-epc-03-postbash-observed-importer.review.md
  - tasks/notes/20260722-1810-epc-03-postbash-observed-importer.notes.md
  - src/effects/evidence/post-bash-importer.ts
  - src/cli/hook/command-observed.ts
  - tests/evidence-post-bash-importer.test.ts
  - .ai/harness/worktrees/epc-03-postbash-observed-importer.json
  - tasks/todos.md
```

## Evidence Requirements

```yaml
evidence_requirements:
  # New producer; no benchmark-subject-touching change in this package.
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
    - src/effects/evidence/post-bash-importer.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260722-1810-epc-03-postbash-observed-importer.notes.md
  tests_pass:
    - path: tests/evidence-post-bash-importer.test.ts
  commands_succeed:
    - bash scripts/check-task-workflow.sh --strict
  manual_checks:
    - "PR diff confined to allowed_paths; no EPC-01/EPC-02 file modified; zero overlap with EPC-04 allowed_paths"
    - "Observed-only ledger leaves authoritative filter empty (fixture)"
    - "tasks/current.md untouched"
```

## Concurrency and Ownership

- **R4 wave qualification proof** (EPC-02/03/04 parallel wave, evaluated
  after EPC-01/EPC-02 merged): schema, trust matrix, and idempotency are
  frozen by the EPC-00 design freeze and already merged via EPC-01
  (`src/core/evidence/types.ts`, `fold.ts`) and EPC-02
  (`src/effects/evidence/epoch.ts`, `verify-producer.ts` as pattern
  reference) -- this package does not re-decide or modify any of them.
- **Exact `allowed_paths` disjointness**: this package's `allowed_paths`
  (above) has zero overlap with EPC-04's. EPC-04 owns
  `scripts/acceptance-receipt.ts`,
  `assets/templates/helpers/acceptance-receipt.ts`,
  `src/effects/evidence/attested-import.ts`,
  `tests/evidence-attested-import.test.ts`, and its own
  plan/contract/review/notes/worktree-registration files. This package
  owns `src/effects/evidence/post-bash-importer.ts`,
  `src/cli/hook/command-observed.ts` (wiring edit only),
  `tests/evidence-post-bash-importer.test.ts`, and its own
  plan/contract/review/notes/worktree-registration files. Neither package
  touches the other's file.
- **Disjoint test fixtures**: this package's fixtures use tmp roots
  prefixed `post-bash-importer-*` (`tests/evidence-post-bash-importer.test.ts`),
  distinct from EPC-04's `tests/evidence-attested-import.test.ts` fixture
  names.
- **No shared barrel/export file**: there is no `index.ts` anywhere under
  `src/effects/evidence/` (confirmed at task start and unchanged by this
  package); each producer is imported directly by its own path.
- **No shared store writer**: this package calls the existing EPC-01
  writer (`appendEvidenceEvent`/`appendGenesisRecord` in
  `src/effects/evidence/event-log.ts`) exactly as EPC-02 already does;
  it adds no new writer and edits no existing writer.
- **No shared projection writer**: this package produces no
  `checks/latest`-style projection; `checks/post-bash-latest.json`
  authoring is untouched pre-epoch legacy (D2), not a projection this
  row retires or rewrites.
- This package's own private git/contract helpers
  (`resolveContractPath`, `isContractCommittedClean`,
  `lastCommitTouching`, `parseContractAllowedPaths`, `workspaceId`, etc.)
  are a separate, non-exported copy from `verify-producer.ts`'s
  equivalents -- read as a pattern reference only, never imported from,
  per R4's "no shared" wave-qualification requirement.
- If an out-of-band merge lands on `main` touching this package's
  `allowed_paths` before this package's PR merges, stop, re-fetch, and
  re-derive against the new state; never force-push over it.

## Acceptance Notes (Human Review)

- Functional behavior: adds a new `observed`-only importer
  (`importPostBashObservation`) and wires it additively into
  `command-observed.ts` after the existing `post-bash-latest.json` write.
  No existing EPC-01/EPC-02 file, and no EPC-04 file, is modified.
- Edge cases: no active contract resolves; a dirty (uncommitted) active
  contract; an untracked (never committed) active contract; a non-git
  fixture directory (repo-state fields degrade to `unbound` rather than
  refusing, since `observed` never satisfies a gate); malformed input
  (non-integer exit code, negative duration, unsafe raw-output path);
  re-import with identical inputs (idempotency dedup at fold time, not at
  append time); genesis-before-append semantics reused unmodified from
  EPC-01; realistic raw-output paths and full hashes are 32+ char
  dot-free runs that would trip EPC-01's D6 redaction if stored verbatim
  -- both are stored as short, fixed-length references instead.
- Regression risks: none to existing runtime surfaces -- the only
  existing file touched is `command-observed.ts`, and only additively
  (a new call after its existing checks-file write, with failure folded
  into the same pre-existing catch-all). The full existing
  `tests/command-observed.test.ts`,
  `tests/harness-circuit-breakers.test.ts`, `tests/hook-runtime.test.ts`,
  and `tests/cli/hook.test.ts` suites (which invoke `runCommandObserved`
  against bare, non-git tmp directories) were re-run after this wiring
  change and stayed green, confirming the additive import degrades
  gracefully rather than newly failing those fixtures. The residual risk
  surface is a later EPC-0N package mis-citing the frozen epoch constant
  or bypassing `importPostBashObservation`'s single entry point, guarded
  by this package's Falsifier and the trust-class-hardcoded design.

## Rollback Point

- Commit / checkpoint: the single commit on
  `codex/epc-03-postbash-observed-importer` before it merges.
- Revert strategy: revert the single PR -- every change is a new module
  (`post-bash-importer.ts`), a new test suite, and one additive wiring
  edit in `command-observed.ts` (a new call after the existing
  `post-bash-latest.json` write, no existing line altered); this
  package's workflow artifacts revert with it. `checks/post-bash-latest`
  authoring and every other surface are unchanged, so reverting cannot
  regress any existing consumer.
