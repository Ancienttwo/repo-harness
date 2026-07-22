# Task Contract: epc-01-evidence-event-store

> **Status**: Active
> **Plan**: plans/plan-20260722-1151-epc-01-evidence-event-store.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Reviewer**: Claude
> **Waiver Policy**: user_waiver allowed, owner kito only, per Acceptance Policy below
> **Base SHA**: `5228d4ea0d7987cf6fb73be216d5b9cc638817c3` (pinned per R1 after EPC-00 merged via PR #116 plus its row-flip commit; verified equal to this worktree's HEAD at task start)
> **Target Branch**: main (via one independent PR)
> **Working Branch**: `codex/epc-01-evidence-event-store`
> **PR Unit**: one PR carrying the new evidence modules (`src/core/evidence/`, `src/effects/evidence/`) plus their tests, one `.gitignore` line, and this package's workflow artifacts
> **Capability ID**: root
> **Last Updated**: 2026-07-22 11:51
> **Review File**: `tasks/reviews/20260722-1151-epc-01-evidence-event-store.review.md`
> **Notes File**: `tasks/notes/20260722-1151-epc-01-evidence-event-store.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

EPC-01 implements Sprint C backlog row 5: the single `EvidenceEvent` schema and
the atomic append-only per-worktree event store, exactly as frozen by EPC-00's
design decisions D1-D6 (sprint `### Frozen decisions (EPC-00, 2026-07-22)`
section -- the design authority; this package re-decides nothing). Rows 6-13
(producers, importers, materializers, checkpoints, recovery-view cutover) all
depend on one evidence authority existing first; shipping a producer or a
cutover in this same package would violate the sprint's one-authority-per-
package rule and R5's same-package-cutover discipline.

## Goal

1. `EvidenceEvent` schema with the frozen field set: D3 subject identity
   (`authority_commit`, `base_commit`, `target_commit`, `scope_hash`,
   `subject_hash`, `contract_hash`, `command_hash`, `env_provider_id`,
   envelope `schema_version` + `worktree_id`), D4 trust class enum
   (`authoritative_machine` | `observed` | `human_acceptance` |
   `external_attested`), D5 identity (`event_id` = `evt-<ULID>`,
   `correlation_run_id`, idempotency key, optional `supersedes`).
2. Append-only store under `.ai/harness/evidence/events/` (per-worktree,
   gitignored): atomic whole-line JSONL append + fsync; genesis record
   carrying `ledger_epoch_start_sha` as a hard precondition of the first
   append (D2, fail closed); total order = append position (D5).
3. Content-addressed blob store under `.ai/harness/evidence/blobs/` with D6
   invariants by construction: 200-line/8-KiB inline cap with overflow to
   `blob_sha256`+`blob_bytes`, secret-denylist + high-entropy redaction
   before write, repo-relative-path-only rule (fail closed on escape),
   symlinks never dereferenced, binary always offloaded, sha256 only,
   write-once immutable blobs.
4. Pure replay/fold in `src/core/evidence/`: deterministic accepted-set
   computation (idempotency dedup, supersedes exclusion, append-position
   order) as a pure function; corrupt-tail recovery truncates at the last
   valid offset and quarantines the tail to `events.corrupt-<ts>` (D5, fail
   closed -- never skip a corrupt middle record).
5. Tests proving: append atomicity; replay determinism; corrupt-tail
   truncation + quarantine; duplicate-import no-op; supersedes exclusion;
   genesis-before-append fail-closed; redaction as construction invariant;
   absolute/escaping path fail-closed; blob write-once.
6. `.gitignore` entry `.ai/harness/evidence/`.
7. All root required checks green in the contract worktree; one independent
   PR on `codex/epc-01-evidence-event-store`.

## P1: Architecture Map

- Design authority: sprint `### Frozen decisions (EPC-00, 2026-07-22)` D1-D6;
  this package cites, never re-decides.
- `src/core/` holds pure logic (existing precedent: `core/state`,
  `core/workflow`); `src/effects/` holds IO (existing precedent:
  `effects/fs-transaction.ts`, `effects/state`). New modules:
  `src/core/evidence/` (schema types, ULID, canonical JSON, idempotency key,
  redaction, inline-cap policy, fold/accepted-set, corrupt-tail policy -- all
  pure, no `fs`/`process` imports) and `src/effects/evidence/` (path
  resolution, durable append/fsync primitives, the event log, the blob
  store, secret-env collection, and the single event-construction path).
- No existing module imports the new store in this package (no consumer
  cutover); the new modules import only existing shared utilities
  (`src/effects/path-safety.ts`) -- never `src/cli` hook handlers, never
  `src/effects/fs-transaction.ts`'s private helpers (its own
  `writeFileDurably` is not exported, so an equivalent append/write helper is
  implemented locally in `src/effects/evidence/atomic-append.ts`; see notes).
- Legacy evidence surfaces (`.ai/harness/events.jsonl`, `checks/*`,
  `journal/`, `runs/`) are pre-epoch artifacts per D2: untouched, never
  parsed as EvidenceEvents.

## P2: Concrete Trace

EPC-00 merges via PR #116 -> `main` advances to `5228d4ea` (row-4 flip) ->
EPC-01 pins that SHA as Base SHA (R1) -> contract worktree opens on
`codex/epc-01-evidence-event-store` from that exact commit -> `bun install
--frozen-lockfile` -> `src/core/evidence/` + `src/effects/evidence/` + tests
land (tests written first, confirmed red on missing modules, then
implemented to green) -> first append in a fresh store writes the genesis
record with `ledger_epoch_start_sha` = this package's pinned base (D2 rule)
-> replay fold produces byte-identical accepted sets across runs ->
corrupt-tail fixtures truncate + quarantine -> full `bun test` (1711 pass, 1
pre-existing skip, 0 fail) and root required checks pass in the worktree ->
one commit -> one PR merges -> EPC-02 pins its own base per R1.

## P3: Design Decision

- Split pure/IO along the repo's existing `core`/`effects` boundary rather
  than one module: replay determinism and accepted-set logic must be
  testable without touching a filesystem, and later materializers will
  consume the pure fold without importing the writer.
- Single JSONL log file per worktree (`events/log.jsonl`) rather than
  file-per-event: D5's total order is append position in "the per-worktree
  log"; a directory of files would reintroduce mtime/filename ordering,
  which D5/D7 forbid.
- The idempotency key and redaction run inside the writer's constructor path
  (`src/effects/evidence/event-writer.ts`'s `buildEvidenceEvent`), not as a
  separate sanitize step a caller could skip -- `appendEvidenceEvent` only
  accepts the raw input descriptor, never a pre-built record, so there is no
  bypass.
- ULID implementation is vendored as a small pure function (no new
  dependency): `encodeUlid(timeMs, randomness)` is a pure function of its two
  explicit inputs (replay/tests never depend on wall-clock time or the
  system RNG); `generateUlid`/`generateEventId` are the impure convenience
  wrappers real producers call.
- Full design rationale for every non-obvious call within D1-D6's letter
  (redaction single-pass merge, corrupt-tail quarantine-vs-throw, path-field
  convention, blob mismatch handling, symlink hashing) is recorded in
  `tasks/notes/20260722-1151-epc-01-evidence-event-store.notes.md`.

## Scope

- In scope: `src/core/evidence/`, `src/effects/evidence/`, the three named
  test files, one `.gitignore` entry, this package's plan/contract/review/
  notes, `tasks/todos.md` if the projection machinery rewrites it, and
  `.ai/harness/worktrees/epc-01-evidence-event-store.json` (gitignored
  worktree state marker; present for parity with the EPC-00 contract's
  `allowed_paths` shape, expected to produce no tracked diff).
- Out of scope: any producer/importer/materializer (rows 6-12), any edit to
  existing hook handlers, `verify-sprint`, `checks/*` writers, handoff/
  resume/current writers, `tasks/current.md`, benchmark surfaces, the sprint
  document (row flip happens post-merge on `main`, outside this package),
  any new npm dependency.
- Non-goals: reading or migrating pre-epoch artifacts; wiring any gate to the
  ledger; checkpoint materialization; `checks/latest` selection.
- Taste constraints: match the existing `core`/`effects` idiom observed in
  `src/effects/path-safety.ts`, `src/effects/fs-transaction.ts`, and
  `src/core/adoption/managed-block.ts` (readonly interfaces, `{ ok, error }`
  result shapes, plain exported functions, no classes, no barrel
  `index.ts`); smallest diff that satisfies D1-D6.

## Stop Conditions

- Stop and hand back to the parent if `origin/main` has moved past
  `5228d4ea0d7987cf6fb73be216d5b9cc638817c3` before this package's worktree
  was created -- re-fetch and re-audit, never silently re-pin.
- Stop and hand back to the parent if implementing any invariant would
  require editing a path outside `allowed_paths` (e.g. an existing shared
  utility needs a change) -- report instead of widening scope silently.
- Stop if `check-architecture-sync` blocks (not merely advises) on the new
  `src/` modules -- report the capability-registry gap rather than editing
  `.ai/context/` or architecture files.
- Stop after three fail-fix-reverify rounds on one issue.

## Falsifier

The direction is wrong if the store cannot satisfy a D1-D6 invariant without
modifying existing runtime surfaces (would mean the frozen design conflicts
with repo reality), or if any test needs a consumer wired in to pass.
Cheapest proof: the PR diff contains only new files plus one `.gitignore`
line and the package workflow files; `bun test` green including the new
evidence suites.

## Root Cause Evidence

Not applicable: Task Profile is `code-change`, not `bugfix`.

## Cheapest Sufficient Proof

- Local worktree HEAD equals `5228d4ea0d7987cf6fb73be216d5b9cc638817c3` at
  task start; contract records it.
- New evidence test files pass (31 tests, 3 files); full `bun test` green
  (1711 pass / 1 pre-existing skip / 0 fail); all root required checks green
  in the worktree.
- `git diff --name-only <base>..HEAD` (subject to the final commit) is a
  subset of `allowed_paths`; no existing `src/` file modified.
- Replay determinism test asserts byte-identical accepted-set output across
  two independent folds/reads of the same log.

## Concurrency and Ownership

- This package owns exactly the paths in `allowed_paths` below; it does not
  touch any other package's plan, contract, review, notes, or code surface.
- Per sprint R2 Layer 2, this package makes no benchmark-subject-touching
  change, so it holds no subject freeze and does not participate in one.
- If an out-of-band merge lands on `main` touching this package's
  `allowed_paths` before this package's PR merges, stop, re-fetch, and
  re-derive against the new state; never force-push over it.

## No-Compatibility Declaration

This package introduces no alias, dual read/write path, semantic fallback,
or steady-state migration shim. It retires nothing (no prior evidence
authority exists to retire) and cuts over no existing consumer -- no
producer, importer, materializer, or gate reads this store yet; that wiring
belongs to later Sprint C rows, each of which retires its own predecessor
writer in its own package (sprint R5).

## Workflow Inventory

- Source plan: `plans/plan-20260722-1151-epc-01-evidence-event-store.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260722-1151-epc-01-evidence-event-store.review.md`
- Notes file: `tasks/notes/20260722-1151-epc-01-evidence-event-store.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this
  contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed
  AcceptanceReceipt under the frozen policy below, then run `verify-sprint`;
  review Markdown is projection only.

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260722-1151-epc-01-evidence-event-store.md
  - tasks/contracts/20260722-1151-epc-01-evidence-event-store.contract.md
  - tasks/reviews/20260722-1151-epc-01-evidence-event-store.review.md
  - tasks/notes/20260722-1151-epc-01-evidence-event-store.notes.md
  - src/core/evidence/
  - src/effects/evidence/
  - tests/evidence-event-store.test.ts
  - tests/evidence-blob-store.test.ts
  - tests/evidence-replay-recovery.test.ts
  - .gitignore
  - .ai/harness/worktrees/epc-01-evidence-event-store.json
  - tasks/todos.md
```

## Forbidden Paths and Actions

```yaml
forbidden:
  paths:
    - src/ (every path other than src/core/evidence/ and src/effects/evidence/)
    - scripts/
    - assets/
    - package.json
    - tasks/current.md
    - plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md
    - any hook handler (.ai/hooks/, src/cli/hook/)
    - any existing checks/handoff writer
  flags:
    - any git --force flag
  actions:
    - push in this step (local commit only; no push, no PR open, no merge)
    - adding a new npm dependency
```

## Evidence Requirements

```yaml
evidence_requirements:
  # New ledger substrate; consumes no benchmark subject.
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
    - src/core/evidence/types.ts
    - src/effects/evidence/event-log.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260722-1151-epc-01-evidence-event-store.notes.md
  tests_pass:
    - path: tests/evidence-event-store.test.ts
    - path: tests/evidence-blob-store.test.ts
    - path: tests/evidence-replay-recovery.test.ts
  commands_succeed:
    - bash scripts/check-task-workflow.sh --strict
  manual_checks:
    - "PR diff confined to allowed_paths; no existing src/ file modified"
    - "Genesis record precondition enforced fail-closed"
    - "tasks/current.md untouched"
```

## Manual Acceptance

- Reviewer (`Claude`, per Acceptance Policy) confirms: `src/core/evidence/`
  and `src/effects/evidence/` implement D1-D6 exactly as frozen; the three
  named test files cover append atomicity, genesis-before-append fail-closed,
  replay determinism, duplicate-import no-op, supersedes exclusion,
  corrupt-tail truncation + quarantine (including the corrupt-middle-record
  case), redaction invariant, path fail-closed, inline-cap overflow, and
  blob write-once; the PR diff is confined to `allowed_paths`; no existing
  `src/` file is modified; `tasks/current.md` is untouched.

## Acceptance Notes (Human Review)

- Functional behavior: adds a new, unwired evidence ledger substrate (schema,
  append-only store, blob store, pure fold/replay). No existing runtime path
  reads or writes it; no producer, consumer, or gate is cut over.
- Edge cases: `origin/main` moving past the pinned base before this
  package's PR merges (see Concurrency and Ownership); corrupt-tail recovery
  is exercised for both an end-of-file truncated record and a corrupt middle
  record followed by further well-formed-looking writes.
- Regression risks: none to existing runtime surfaces (no existing file is
  modified); the risk surface is a later EPC-0N package mis-citing a frozen
  D-decision or bypassing `buildEvidenceEvent`'s construction path, both
  guarded by this package's Falsifier and the "single construction path, no
  skippable sanitize step" design.

## Rollback

Revert the single PR: every change is new files under `src/core/evidence/`,
`src/effects/evidence/`, `tests/`, plus one `.gitignore` line and this
package's workflow artifacts; no existing runtime surface is modified.
Before any PR opens, this package's local worktree commit can also be
discarded outright via `git worktree remove` (run from outside the
worktree), with no effect on the root checkout or `main`.
