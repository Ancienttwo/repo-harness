# Task Contract: epc-02-authoritative-verify-producer

> **Status**: Active
> **Plan**: plans/plan-20260722-1634-epc-02-authoritative-verify-producer.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Reviewer**: Claude
> **Waiver Policy**: user_waiver allowed, owner kito only, per Acceptance Policy below
> **Base SHA**: `a8cae4d78f1a4451f3a5335b9fc345740c3c61db` (pinned per R1 after EPC-01 merged via PR #117 plus its row-flip commit; verified equal to this worktree's HEAD at task start)
> **Target Branch**: main (via one independent PR)
> **Working Branch**: `codex/epc-02-authoritative-verify-producer`
> **PR Unit**: one PR carrying the epoch constant, the producer, the CLI wrapper, the `verify-sprint.sh` wiring edit, the test suite, and this package's workflow artifacts
> **Capability ID**: root
> **Last Updated**: 2026-07-22 16:34
> **Review File**: `tasks/reviews/20260722-1634-epc-02-authoritative-verify-producer.review.md`
> **Notes File**: `tasks/notes/20260722-1634-epc-02-authoritative-verify-producer.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

EPC-02 implements Sprint C backlog row 6: the authoritative verify producer.
The verify runner (`verify-sprint` chain) must emit subject-bound
`authoritative_machine` EvidenceEvents into the EPC-01 ledger, with
non-subject-bound emission impossible by construction (D3/D4). Rows 9-12
(materializers, checkpoints, Context Packet) select accepted events by trust
class and exact subject; without a producer there is nothing authoritative
to select. This package also introduces the Program's single epoch constant
(`LEDGER_EPOCH_START_SHA`, frozen D2 to the exact base SHA the EPC-01
contract pinned) so later producers (EPC-03/04) import one authority instead
of duplicating the literal.

## Goal

1. `src/effects/evidence/epoch.ts`: export the frozen epoch constant
   `LEDGER_EPOCH_START_SHA` (D2; value `5228d4ea0d7987cf6fb73be216d5b9cc638817c3`,
   the base SHA the EPC-01 contract consumed at its own fresh fetch).
2. `src/effects/evidence/verify-producer.ts`: a single entry function,
   `emitAuthoritativeVerifyEvidence`, that resolves the active contract,
   recomputes the review-subject sha256 via the existing builder
   (`src/effects/review/diff-fingerprint.ts`, read-only import), builds the
   complete D3 subject identity from repo state, ensures genesis with
   `LEDGER_EPOCH_START_SHA`, then appends exactly one `authoritative_machine`
   event with a small structured payload (status, counts, run-snapshot
   repo-relative path). Fails closed (typed result, no emission) when: no
   active contract resolves; the contract file is dirty or untracked
   (authority must be committed); the recomputed subject hash differs from
   an expected hash the caller supplied; or the EPC-01 store rejects the
   epoch. No API path emits with a partial subject -- the function computes
   every identity field itself; callers supply only raw material it cannot
   observe on its own (the exact command line, an optional expected subject
   hash for verification, and the small payload fields).
3. `scripts/emit-verify-evidence.ts`: a thin bun CLI wrapper (arg parsing
   only) so `verify-sprint.sh` can invoke the producer from bash. Distinct
   exit codes, per ruling (orchestrator follow-up, 2026-07-22): `0` =
   emitted; `3` = cannot-bind refusal (no active contract, dirty/untracked
   contract, or the TS entry unresolvable in a deployed-helper context);
   `2` = CLI usage error; any other non-zero (`1`) = a real failure
   (subject mismatch, store/genesis error). The producer module itself is
   unchanged by this: it still returns one typed `{ ok: false, reason,
   message }` refusal for every fail-closed condition; only the wrapper's
   mapping of `reason` to an exit code distinguishes cannot-bind from real
   failure. Sprint row 6 requires only that non-subject-bound emission be
   impossible and that a subject mismatch fail closed -- not that every
   verify run emit -- so cannot-bind is refusal-to-fabricate, not a
   fallback: no gate reads the ledger yet, so skipping satisfies nothing.
4. Wire `scripts/verify-sprint.sh`: after successful verification in both
   the `--prepare-acceptance` freeze path and the finalize path, invoke the
   wrapper with the frozen `review_subject_sha256` and a result summary
   read back out of `checks/latest.json`. Exit `0` continues; exit `3`
   (cannot-bind) prints one stderr notice and continues with the verify
   result unchanged; any other non-zero fails the verify run (no `|| true`,
   no silent fallback for a real failure). The existing `checks/latest.json`
   write is untouched; emission is additive. Companion-script resolution
   for the TS entry mirrors the existing `$helper_dir/acceptance-receipt.ts`
   sibling lookup, with the same `REPO_HARNESS_SOURCE_ROOT` fallback
   `workflow_source_authority_call` already uses elsewhere in this script
   for source-authority resolution -- no new resolution mechanism.
5. `tests/evidence-verify-producer.test.ts`, red-first: subject mismatch
   fails closed with nothing appended; a dirty or untracked contract fails
   closed with nothing appended; a successful emission is one
   `authoritative_machine` event with the complete D3 field set, accepted by
   the EPC-01 fold; re-emission with identical inputs is idempotent (one
   accepted event, two physical appends); genesis is written once with
   `LEDGER_EPOCH_START_SHA`.
6. All root required checks green; one independent PR on
   `codex/epc-02-authoritative-verify-producer`.

## Scope

- In scope: `src/effects/evidence/epoch.ts`,
  `src/effects/evidence/verify-producer.ts`,
  `scripts/emit-verify-evidence.ts`, `scripts/verify-sprint.sh` (wiring edit
  only, additive), `tests/evidence-verify-producer.test.ts`, this package's
  plan/contract/review/notes, `tasks/todos.md` projection,
  `.ai/harness/worktrees/epc-02-authoritative-verify-producer.json`.
- Out of scope: every EPC-01 file (`src/core/evidence/*`,
  `src/effects/evidence/*` existing files -- read-only imports),
  `checks/latest` composition or any direct-authoring deletion (EPC-05),
  `verify-contract.sh`, PostBash (EPC-03), acceptance-receipt (EPC-04),
  handoff/resume/current writers (EPC-07), `tasks/current.md`, the sprint
  document, any new npm dependency.
- Taste constraints: match the existing `core`/`effects` idiom (readonly
  interfaces, `{ ok, ... }`/discriminated-union result shapes, plain
  exported functions, no classes, no barrel `index.ts`); smallest diff that
  satisfies the frozen D2-D6 decisions.

## Stop Conditions

- Stop and hand back to the parent if `origin/main` has moved past
  `a8cae4d78f1a4451f3a5335b9fc345740c3c61db` before this package's worktree
  was created -- re-fetch and re-audit, never silently re-pin.
- Stop and hand back to the parent if correct emission would require
  modifying an EPC-01 module or `verify-contract.sh` -- report instead of
  widening scope silently.
- Stop if `check-architecture-sync` BLOCKS (not merely advises) on the
  changed capability surfaces -- report rather than editing `.ai/context/`
  or architecture files.
- Stop after three fail-fix-reverify rounds on one issue.

## Falsifier

The direction is wrong if subject-bound emission cannot be built from the
existing review-subject builder without modifying it, or if the verify
chain cannot tolerate fail-closed emission (i.e. this package's own dogfood
`verify-sprint --prepare-acceptance` acceptance run cannot pass with
emission enabled). Cheapest proof: this package's own acceptance run
appends exactly one accepted `authoritative_machine` event to the worktree
ledger, with genesis written using `LEDGER_EPOCH_START_SHA`, and still
passes.

## Root Cause Evidence

Not applicable: Task Profile is `code-change`, not `bugfix`.

## Workflow Inventory

- Source plan: `plans/plan-20260722-1634-epc-02-authoritative-verify-producer.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260722-1634-epc-02-authoritative-verify-producer.review.md`
- Notes file: `tasks/notes/20260722-1634-epc-02-authoritative-verify-producer.notes.md`
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
  - plans/plan-20260722-1634-epc-02-authoritative-verify-producer.md
  - tasks/contracts/20260722-1634-epc-02-authoritative-verify-producer.contract.md
  - tasks/reviews/20260722-1634-epc-02-authoritative-verify-producer.review.md
  - tasks/notes/20260722-1634-epc-02-authoritative-verify-producer.notes.md
  - src/effects/evidence/epoch.ts
  - src/effects/evidence/verify-producer.ts
  - scripts/emit-verify-evidence.ts
  - scripts/verify-sprint.sh
  - assets/templates/helpers/verify-sprint.sh
  - tests/evidence-verify-producer.test.ts
  - .ai/harness/worktrees/epc-02-authoritative-verify-producer.json
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
    - src/effects/evidence/epoch.ts
    - src/effects/evidence/verify-producer.ts
    - scripts/emit-verify-evidence.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260722-1634-epc-02-authoritative-verify-producer.notes.md
  tests_pass:
    - path: tests/evidence-verify-producer.test.ts
  commands_succeed:
    - bun run check:type
    - bash scripts/check-task-workflow.sh --strict
  manual_checks:
    - "PR diff confined to allowed_paths; no EPC-01 file modified"
    - "Package's own acceptance run appended one accepted authoritative_machine event with genesis epoch constant"
    - "tasks/current.md untouched"
```

## Concurrency and Ownership

- This package owns exactly the paths in `allowed_paths` above; it does not
  touch any other package's plan, contract, review, notes, or code surface.
- This package deliberately runs serial BEFORE any EPC-03/04 wave because it
  introduces the shared epoch constant (`LEDGER_EPOCH_START_SHA` in
  `src/effects/evidence/epoch.ts`): landing it first gives EPC-03/04 one
  authority to import instead of each duplicating the literal, which R4's
  wave-qualification rule would otherwise treat as a shared-surface
  violation. R4 wave qualification for EPC-03/04 is evaluated only after
  this package merges.
- Per sprint R2 Layer 2, this package makes no benchmark-subject-touching
  change, so it holds no subject freeze and does not participate in one.
- If an out-of-band merge lands on `main` touching this package's
  `allowed_paths` before this package's PR merges, stop, re-fetch, and
  re-derive against the new state; never force-push over it.

## Acceptance Notes (Human Review)

- Functional behavior: adds a new producer (`emitAuthoritativeVerifyEvidence`)
  and its CLI wrapper, wires `verify-sprint.sh` to call it additively after
  a passing verification, and adds the Program's shared epoch constant. No
  existing EPC-01 file, `verify-contract.sh`, or `checks/latest` writer is
  modified.
- Edge cases: dirty/untracked active contract; recomputed subject hash
  differing from a caller-supplied expected hash; re-emission with
  identical inputs (idempotency dedup at fold time, not at append time);
  genesis-before-append semantics reused unmodified from EPC-01.
- Regression risks: none to existing runtime surfaces (no existing file is
  modified other than the additive `verify-sprint.sh` wiring, which fails
  the verify run on a real failure and prints one documented notice --
  never silent -- on a cannot-bind refusal). The risk surface is a later
  EPC-0N package mis-citing the frozen epoch constant, bypassing
  `emitAuthoritativeVerifyEvidence`'s single entry point, or a caller
  mistaking cannot-bind for success (the wrapper's exit code and stderr
  notice both distinguish it), all guarded by this package's Falsifier,
  its "no partial subject" design, and the wrapper-level exit-code tests.

## Rollback Point

- Commit / checkpoint: the single commit on `codex/epc-02-authoritative-verify-producer` before it merges.
- Revert strategy: revert the single PR -- every change is new files
  (`epoch.ts`, `verify-producer.ts`, the CLI wrapper, the test suite) plus
  one additive wiring edit in `scripts/verify-sprint.sh` and this package's
  workflow artifacts; `checks/latest` authoring and every other surface are
  unchanged, so reverting cannot regress any existing consumer.
