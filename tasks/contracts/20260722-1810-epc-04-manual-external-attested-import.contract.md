# Task Contract: epc-04-manual-external-attested-import

> **Status**: Done
> **Plan**: plans/plan-20260722-1810-epc-04-manual-external-attested-import.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Reviewer**: Claude
> **Waiver Policy**: user_waiver allowed, owner kito only, per Acceptance Policy below
> **Base SHA**: `8861b40dd85c0f7faabe8eecd217baf5528a7f3c` (pinned per R1 post-EPC-02: fresh fetch after PR #118 merged, plus its row-flip commit `docs(program): mark epc-02 done via PR #118; EPC-03/04 wave unblocked`; verified equal to this worktree's HEAD at task start)
> **Target Branch**: main (via one independent PR)
> **Working Branch**: `codex/epc-04-manual-external-attested-import`
> **PR Unit**: one PR carrying the attested-import module, the `scripts/acceptance-receipt.ts` wiring edit (plus its deterministic `assets/templates/helpers/` mirror), the test suite, and this package's workflow artifacts
> **Capability ID**: root
> **Last Updated**: 2026-07-22 18:10
> **Review File**: `tasks/reviews/20260722-1810-epc-04-manual-external-attested-import.review.md`
> **Notes File**: `tasks/notes/20260722-1810-epc-04-manual-external-attested-import.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

EPC-04 implements Sprint C backlog row 8: manual/external attested import.
The acceptance flow is the Program's only legitimate source of
human/external trust; today the receipt is a standalone JSON plus a
Markdown projection, with nothing tying it into the evidence authority
rows 9-12 will select from. Recording an AcceptanceReceipt now imports it
into the EPC-01 ledger as an attested event: disposition `external_pass`
-> trust `external_attested`, disposition `user_waiver` -> trust
`human_acceptance` (D4). This makes attested trust a first-class ledger
fact instead of a parallel shadow authority, while leaving the receipt
JSON/projection flow itself unchanged.

## Goal

1. `src/effects/evidence/attested-import.ts`: imports one recorded
   AcceptanceReceipt as ONE attested event via the EPC-01 writer
   (`appendEvidenceEvent`/`appendGenesisRecord`), genesis via
   `LEDGER_EPOCH_START_SHA` (EPC-02's epoch constant, imported read-only).
   Trust mapping is a closed two-entry table: `external_pass` ->
   `external_attested`; `user_waiver` -> `human_acceptance`; any other
   disposition -> fail closed (`unsupported_disposition`). No API path in
   this module emits `authoritative_machine` or `observed`. Required
   fields fail closed when absent/empty: actor (receipt reviewer),
   reason (receipt summary), and the full D3 subject identity taken from
   the receipt's own binding (`subject_sha256` -> `subject_hash`,
   `target_revision` -> `base_commit`) plus repo-state fields computed the
   same way `verify-producer.ts` computes them (worktree HEAD ->
   `target_commit`; contract file hash -> `contract_hash`; ordered
   `allowed_paths` -> `scope_hash`; last commit touching the contract ->
   `authority_commit`; recording host identity -> `env_provider_id`).
   Payload is small and structured (disposition, reviewer, source, actor,
   summary, findings count, a short 16-hex-char subject-hash reference) --
   never a raw 32+ char dot-free hash/path verbatim, which EPC-01's D6
   redaction would over-redact into a useless double-hash.
2. Wire `scripts/acceptance-receipt.ts` at the CLI level only (inside
   `runAcceptanceReceiptCli`'s `record` command, both the `user_waiver`
   and `external_pass`/`reject` branches -- never inside the exported
   `recordAcceptance`/`recordUserWaiverAcceptance` functions themselves):
   after a successful record, dynamically import
   `src/effects/evidence/attested-import.ts` and import the just-recorded
   receipt into the ledger; `reject` is skipped (D4's table has no entry
   for it and it is not a claim of acceptance). Import failure fails the
   record command (fail closed -- an acceptance that cannot enter the
   evidence authority must not report success). Deployed-helper context
   (an adopted downstream repo, or `tests/helper-scripts.test.ts`'s bare
   `copyHelpers()` fixtures, where `src/effects/evidence` does not exist):
   a module-resolution failure (`ERR_MODULE_NOT_FOUND`) is a cannot-bind
   skip, not a crash -- record still succeeds; any other failure (the
   module resolves but the import itself reports a real fail-closed
   reason) still fails the command. `assets/templates/helpers/acceptance-receipt.ts`
   stays a byte-identical mirror via `bun run sync:helpers`.
3. `tests/evidence-attested-import.test.ts`, red-first (confirmed: the
   suite fails with "Cannot find module" before the implementation
   existed): `external_pass` maps to `external_attested` and `user_waiver`
   to `human_acceptance`; an unknown/bogus disposition fails closed with
   nothing appended; missing actor/reason/subject fields fail closed with
   nothing appended; an attested-only ledger's accepted fold filtered for
   `authoritative_machine` is empty (default-deny at the trust level);
   identical re-import dedups to one accepted event via the idempotency
   key (two physical appends); genesis is written once with
   `LEDGER_EPOCH_START_SHA`; a direct `runAcceptanceReceiptCli(['record',
   ...])` integration test proves the CLI wiring itself appends one
   accepted `external_attested` event, and that `reject` leaves the
   ledger untouched.
4. All root required checks green; one independent PR on
   `codex/epc-04-manual-external-attested-import`.

## Scope

- In scope: `src/effects/evidence/attested-import.ts`,
  `scripts/acceptance-receipt.ts` (wiring edit only, CLI-level),
  `assets/templates/helpers/acceptance-receipt.ts` (deterministic mirror,
  regenerated via `bun run sync:helpers`), `tests/evidence-attested-import.test.ts`,
  this package's plan/contract/review/notes, `tasks/todos.md` projection,
  `.ai/harness/worktrees/epc-04-manual-external-attested-import.json`.
- Out of scope: every EPC-01/EPC-02 file (`src/core/evidence/*`,
  `src/effects/evidence/*` existing files including `epoch.ts` and
  `verify-producer.ts` -- read-only imports/pattern reference only),
  `src/cli/hook/command-observed.ts` and every other EPC-03 surface
  (`src/effects/evidence/post-bash-importer.ts`,
  `tests/evidence-post-bash-importer.test.ts`), `checks/latest`
  composition, any gate logic, handoff writers, `tasks/current.md`, the
  sprint document, any new npm dependency.
- Non-goals: gate cutover (EPC-05 selects `external_attested` where a
  contract's Acceptance Policy enumerates it); receipt schema changes;
  retiring the receipt JSON or its Markdown projection.
- Taste constraints: match the existing `core`/`effects` idiom (readonly
  interfaces, `{ ok, ... }`/discriminated-union result shapes, plain
  exported functions, no classes, no barrel `index.ts`); smallest diff
  that satisfies the frozen D2-D6 decisions; private per-producer
  git/contract helpers, not shared with `verify-producer.ts` (R4); the
  receipt shape `attested-import.ts` accepts is a locally-declared
  structural interface, never an import of `scripts/acceptance-receipt.ts`'s
  own `AcceptanceReceipt` type (`src/` must not depend on `scripts/`).

## Stop Conditions

- Stop and hand back to the parent if `origin/main` has moved past
  `8861b40dd85c0f7faabe8eecd217baf5528a7f3c` before this package's
  worktree was created -- re-fetch and re-audit, never silently re-pin.
- Stop and hand back to the parent if correct emission would require
  modifying an EPC-01/EPC-02 module or touching any EPC-03 surface --
  report instead of widening scope silently.
- Stop if `check-architecture-sync` BLOCKS (not merely advises) on the
  changed capability surfaces -- report rather than editing
  `.ai/context/` or architecture files.
- Stop after three fail-fix-reverify rounds on one issue.

## Falsifier

The direction is wrong if the receipt's existing binding cannot populate
the D3 identity without schema changes, or if record-time import breaks
the receipt flow's staleness invariant (record must still immediately
follow evidence preparation). Cheapest proof: this package's own
acceptance flow records its receipt successfully AND the worktree ledger
then contains exactly one accepted `external_attested` event referencing
that receipt.

## Root Cause Evidence

Not applicable: Task Profile is `code-change`, not `bugfix`.

## Workflow Inventory

- Source plan: `plans/plan-20260722-1810-epc-04-manual-external-attested-import.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260722-1810-epc-04-manual-external-attested-import.review.md`
- Notes file: `tasks/notes/20260722-1810-epc-04-manual-external-attested-import.notes.md`
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
  - plans/plan-20260722-1810-epc-04-manual-external-attested-import.md
  - tasks/contracts/20260722-1810-epc-04-manual-external-attested-import.contract.md
  - tasks/reviews/20260722-1810-epc-04-manual-external-attested-import.review.md
  - tasks/notes/20260722-1810-epc-04-manual-external-attested-import.notes.md
  - src/effects/evidence/attested-import.ts
  - scripts/acceptance-receipt.ts
  - assets/templates/helpers/acceptance-receipt.ts
  - tests/evidence-attested-import.test.ts
  - .ai/harness/worktrees/epc-04-manual-external-attested-import.json
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
    - src/effects/evidence/attested-import.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260722-1810-epc-04-manual-external-attested-import.notes.md
  tests_pass:
    - path: tests/evidence-attested-import.test.ts
  commands_succeed:
    - bash scripts/check-task-workflow.sh --strict
  manual_checks:
    - "PR diff confined to allowed_paths; no EPC-01/EPC-02 file modified; zero overlap with EPC-03 allowed_paths"
    - "Own acceptance receipt appears as accepted external_attested event in the worktree ledger (dogfood)"
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
  (above) has zero overlap with EPC-03's. EPC-03 owns
  `src/cli/hook/command-observed.ts`,
  `src/effects/evidence/post-bash-importer.ts`,
  `tests/evidence-post-bash-importer.test.ts`, and its own
  plan/contract/review/notes/worktree-registration files. This package
  owns `scripts/acceptance-receipt.ts`,
  `assets/templates/helpers/acceptance-receipt.ts`,
  `src/effects/evidence/attested-import.ts`,
  `tests/evidence-attested-import.test.ts`, and its own
  plan/contract/review/notes/worktree-registration files. Neither package
  touches the other's file (verified directly against EPC-03's own
  contract, `tasks/contracts/20260722-1810-epc-03-postbash-observed-importer.contract.md`,
  which lists this package's paths identically under its own EPC-04
  disjointness proof).
- **Disjoint test fixtures**: this package's fixtures use tmp roots
  prefixed `attested-import-*` (`tests/evidence-attested-import.test.ts`),
  distinct from EPC-03's `post-bash-importer-*` fixture names.
- **No shared barrel/export file**: there is no `index.ts` anywhere under
  `src/effects/evidence/` (confirmed at task start and unchanged by this
  package); each producer is imported directly by its own path.
- **No shared store writer**: this package calls the existing EPC-01
  writer (`appendEvidenceEvent`/`appendGenesisRecord` in
  `src/effects/evidence/event-log.ts`) exactly as EPC-02/EPC-03 already
  do; it adds no new writer and edits no existing writer.
- **No shared projection writer**: this package produces no
  `checks/latest`-style projection; the receipt JSON and its Markdown
  projection (`renderAcceptanceProjection`/`projectAcceptance`) are
  unchanged pre-existing surfaces, not a projection this row retires or
  rewrites.
- This package's own private git/contract helpers (`resolveHead`,
  `lastCommitTouching`, `parseContractAllowedPaths`, `providerCliVersion`,
  `workspaceId`, etc., in `attested-import.ts`) are a separate,
  non-exported copy from `verify-producer.ts`'s equivalents -- read as a
  pattern reference only, never imported from, per R4's "no shared"
  wave-qualification requirement.
- The `scripts/acceptance-receipt.ts` wiring lives entirely at the CLI
  layer (`runAcceptanceReceiptCli`'s `record` branch), not inside the
  exported `recordAcceptance`/`recordUserWaiverAcceptance` functions
  themselves, so `tests/acceptance-receipt.test.ts` (which imports those
  functions directly and never gitignores `.ai/harness/evidence/` in its
  own fixture) never exercises the new ledger-import side effect and
  stays a pure characterization suite of the pre-existing receipt flow.
- If an out-of-band merge lands on `main` touching this package's
  `allowed_paths` before this package's PR merges, stop, re-fetch, and
  re-derive against the new state; never force-push over it.

## Acceptance Notes (Human Review)

- Functional behavior: adds a new attested-import module
  (`importAttestedEvidence`) and wires it additively into
  `scripts/acceptance-receipt.ts`'s CLI `record` command after a
  successful receipt build. No existing EPC-01/EPC-02 file, and no EPC-03
  file, is modified. `assets/templates/helpers/acceptance-receipt.ts`
  stays byte-identical via `sync:helpers`.
- Edge cases: unknown/bogus disposition; empty reviewer/summary/subject
  fields; an uncommitted or never-committed contract file (no authority
  commit available); re-import with identical inputs (idempotency dedup
  at fold time, not at append time); re-import with a different subject
  (not deduped); genesis-before-append semantics reused unmodified from
  EPC-01; a deployed-helper context where the module cannot resolve
  (cannot-bind skip, not a crash); `reject` disposition is skipped by the
  wiring entirely (no attested trust mapping exists for it, and turning
  an already-exit-code-1 rejection into a hard crash is out of scope).
- Regression risks: none to existing runtime surfaces -- the only
  existing file touched is `scripts/acceptance-receipt.ts`, and only
  additively (two new calls inside the CLI `record` branch, after the
  receipt object is already built; no existing line altered, no exported
  function's behavior changed). The full existing
  `tests/acceptance-receipt.test.ts` (9 tests) and
  `tests/helper-scripts.test.ts` (121 tests, including the
  `sync-helper-sources.ts --check` drift guard) suites were re-run after
  this wiring change and stayed green. The residual risk surface is a
  later EPC-0N package mis-citing the frozen epoch constant or bypassing
  `importAttestedEvidence`'s single entry point, guarded by this
  package's Falsifier and the closed two-entry trust mapping.

## Rollback Point

- Commit / checkpoint: the single commit on
  `codex/epc-04-manual-external-attested-import` before it merges.
- Revert strategy: revert the single PR -- every change is a new module
  (`attested-import.ts`), a new test suite, and one additive wiring edit
  in `scripts/acceptance-receipt.ts` (two new calls inside the CLI
  `record` branch, no existing line altered) plus its deterministic
  helper mirror; this package's workflow artifacts revert with it.
  Receipt JSON/projection authoring and every other surface are
  unchanged, so reverting cannot regress any existing consumer.
