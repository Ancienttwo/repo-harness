# Plan: EPC-01: EvidenceEvent Protocol and Event Store

> **Status**: Executing
> **Created**: 20260722-1151
> **Slug**: epc-01-evidence-event-store
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: host-plan
> **Source Ref**: sprint:plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md#epc-01
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: New evidence test suites prove append atomicity, replay determinism, corrupt-tail truncation+quarantine, duplicate-import no-op, supersedes exclusion, genesis fail-closed, redaction-by-construction, path fail-closed, blob write-once; full bun test and root required checks green in the contract worktree
> **Rollback Surface**: Revert the single PR: all changes are new files under src/core/evidence/, src/effects/evidence/, tests/, plus one .gitignore line and package workflow artifacts; no existing runtime surface is modified
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260722-1151-epc-01-evidence-event-store.contract.md`
> **Task Review**: `tasks/reviews/20260722-1151-epc-01-evidence-event-store.review.md`
> **Implementation Notes**: `tasks/notes/20260722-1151-epc-01-evidence-event-store.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: sprint:plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md#epc-01
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260722-1151-epc-01-evidence-event-store.md`
- Sprint contract: `tasks/contracts/20260722-1151-epc-01-evidence-event-store.contract.md`
- Sprint review: `tasks/reviews/20260722-1151-epc-01-evidence-event-store.review.md`
- Implementation notes: `tasks/notes/20260722-1151-epc-01-evidence-event-store.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260722-1151-epc-01-evidence-event-store.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260722-1151-epc-01-evidence-event-store.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260722-1151-epc-01-evidence-event-store.md`.

## Approach
### Strategy
Use the captured planning output below as the execution source of truth.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| See captured planning output | Follow | Implement only the approved scope named below |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260722-1151-epc-01-evidence-event-store.contract.md`
- Review file: `tasks/reviews/20260722-1151-epc-01-evidence-event-store.review.md`
- Implementation notes file: `tasks/notes/20260722-1151-epc-01-evidence-event-store.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260722-1151-epc-01-evidence-event-store.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260722-1151-epc-01-evidence-event-store.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the single PR: all changes are new files under src/core/evidence/, src/effects/evidence/, tests/, plus one .gitignore line and package workflow artifacts; no existing runtime surface is modified
- **Verification boundary**: New evidence test suites prove append atomicity, replay determinism, corrupt-tail truncation+quarantine, duplicate-import no-op, supersedes exclusion, genesis fail-closed, redaction-by-construction, path fail-closed, blob write-once; full bun test and root required checks green in the contract worktree
- **Review/acceptance boundary**: `tasks/reviews/20260722-1151-epc-01-evidence-event-store.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260722-1151-epc-01-evidence-event-store.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260722-1151-epc-01-evidence-event-store.contract.md`, `tasks/reviews/20260722-1151-epc-01-evidence-event-store.review.md`, and `tasks/notes/20260722-1151-epc-01-evidence-event-store.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260722-1151-epc-01-evidence-event-store.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the single PR: all changes are new files under src/core/evidence/, src/effects/evidence/, tests/, plus one .gitignore line and package workflow artifacts; no existing runtime surface is modified

## Captured Planning Output

> **Task Profile**: code-change

## Decision Summary

EPC-01 implements Sprint C backlog row 5: the single `EvidenceEvent` schema
and the atomic append-only per-worktree event store, exactly as frozen by
EPC-00's design decisions D1–D6 (sprint `### Frozen decisions (EPC-00,
2026-07-22)` section — the design authority; this package re-decides
nothing). Pure schema, fold/replay, and accepted-set logic live in
`src/core/evidence/`; the IO store (atomic append, genesis record, blob
store, corrupt-tail recovery, quarantine) lives in `src/effects/evidence/`.
No existing surface is cut over: no producer, no consumer, no gate reads
the ledger yet (rows 6–13 own those packages). `.gitignore` gains the
`.ai/harness/evidence/` entry per D1. Base SHA is pinned per R1 at fresh
fetch: `5228d4ea0d7987cf6fb73be216d5b9cc638817c3` (`POST_VGBR_SHA` lineage:
EPC-00 merged via PR #116 plus its row-flip commit).

## Why

Rows 6–13 (producers, importers, materializers, checkpoints, recovery-view
cutover) all depend on one evidence authority existing first. EPC-00 froze
the design (D1 topology, D2 epoch, D3 subject identity, D4 trust classes,
D5 event identity/replay, D6 blob and safety policy); EPC-01 is the first
implementation package and delivers only the ledger substrate with proof
(tests) that its invariants hold. Shipping producers or cutovers in the
same package would violate the sprint's one-authority-per-package rule and
R5's same-package-cutover discipline (cutovers belong to the packages that
replace each retired writer).

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
3. Content-addressed blob store under `.ai/harness/evidence/blobs/` with
   D6 invariants by construction: 200-line/8-KiB inline cap with overflow
   to `blob_sha256`+`blob_bytes`, secret-denylist + high-entropy redaction
   before write, repo-relative-path-only rule (fail closed on escape),
   symlinks never dereferenced, binary always offloaded, sha256 only,
   write-once immutable blobs.
4. Pure replay/fold in `src/core/evidence/`: deterministic accepted-set
   computation (idempotency dedup, supersedes exclusion, append-position
   order) as a pure function; corrupt-tail recovery truncates at the last
   valid offset and quarantines the tail to `events.corrupt-<ts>` (D5,
   fail closed — never skip a corrupt middle record).
5. Tests proving: append atomicity; replay determinism (identical accepted
   set and bytes across replays); corrupt-tail truncation + quarantine;
   duplicate-import no-op; supersedes exclusion; genesis-before-append
   fail-closed; redaction as construction invariant; absolute/escaping
   path fail-closed; blob write-once.
6. `.gitignore` entry `.ai/harness/evidence/`.
7. All root required checks green in the contract worktree; one
   independent PR on `codex/epc-01-evidence-event-store`.

## P1: Architecture Map

- Design authority: sprint `### Frozen decisions (EPC-00, 2026-07-22)`
  D1–D6; this package cites, never re-decides.
- `src/core/` holds pure logic (existing precedent: `core/state`,
  `core/workflow`); `src/effects/` holds IO (existing precedent:
  `effects/fs-transaction.ts`, `effects/state`). New modules:
  `src/core/evidence/` (schema, fold, accepted-set, corrupt-tail policy as
  pure functions over parsed records) and `src/effects/evidence/`
  (append/fsync, genesis, blob store, quarantine writes).
- No existing module may import the new store in this package (no consumer
  cutover); the new modules import only existing shared utilities (e.g.
  path safety, fs transaction helpers) — never `src/cli` hook handlers.
- Legacy evidence surfaces (`.ai/harness/events.jsonl`, `checks/*`,
  `journal/`, `runs/`) are pre-epoch artifacts per D2: untouched, never
  parsed as EvidenceEvents.

## P2: Concrete Trace

EPC-00 merges via PR #116 -> `main` advances to `5228d4ea` (row-4 flip) ->
EPC-01 fresh-fetches, verifies `origin/main == 5228d4ea`, pins it as Base
SHA (R1) -> contract worktree opens on `codex/epc-01-evidence-event-store`
-> `src/core/evidence/` + `src/effects/evidence/` + tests land -> first
append in a fresh store writes the genesis record with
`ledger_epoch_start_sha` = this package's pinned base (D2 rule) -> replay
fold produces byte-identical accepted sets across runs -> corrupt-tail
fixture truncates + quarantines -> required checks green -> receipt
recorded immediately after evidence -> one PR merges -> EPC-02 pins its own
base per R1.

## P3: Design Decision

- Split pure/IO along the repo's existing `core`/`effects` boundary rather
  than one module: replay determinism and accepted-set logic must be
  testable without touching a filesystem, and EPC-05/06/07 materializers
  will consume the pure fold without importing the writer.
- Single JSONL log file per worktree (`events/log.jsonl`) rather than
  file-per-event: D5's total order is append position in "the per-worktree
  log"; a directory of files would reintroduce mtime/filename ordering,
  which D5/D7 forbid.
- The idempotency key and redaction run inside the writer's constructor
  path (construction invariant), not as a separate sanitize step a caller
  could skip — D6 explicitly requires deny-by-construction.
- ULID implementation is vendored as a small pure function (no new
  dependency) unless an existing dependency already provides one; adding a
  package for 40 lines fails the smallest-change rule.

## Task Breakdown

- [ ] Verify fresh fetch equals pinned base `5228d4ea`; fill contract.
- [ ] `src/core/evidence/`: schema types, ULID, idempotency key, fold /
      accepted-set, corrupt-tail policy (pure).
- [ ] `src/effects/evidence/`: append-only store, genesis record, blob
      store with D6 invariants, quarantine.
- [ ] Tests for every Goal-5 invariant (red first where feasible).
- [ ] `.gitignore` entry; required checks; commit; receipt; PR.

## Scope

- In scope: `src/core/evidence/`, `src/effects/evidence/`, new test files
  `tests/evidence-*.test.ts`, `.gitignore` (one entry), this package's
  plan/contract/review/notes, `tasks/todos.md` if the projection rewrites
  it.
- Out of scope: any producer/importer/materializer (rows 6–12), any edit
  to existing hook handlers, `verify-sprint`, `checks/*` writers,
  handoff/resume/current writers, `tasks/current.md`, benchmark surfaces,
  the sprint document (row flip happens post-merge on `main`, outside this
  package), any new npm dependency.
- Non-goals: reading or migrating pre-epoch artifacts; wiring any gate to
  the ledger; checkpoint materialization (EPC-06); `checks/latest`
  selection (EPC-05).

## Stop Conditions

- Stop if `origin/main` moves past `5228d4ea` before the worktree is
  created — re-fetch, re-audit, re-pin with report.
- Stop if implementing any invariant would require editing a path outside
  `allowed_paths` (e.g. an existing shared utility needs a change) —
  report instead of widening scope silently.
- Stop after three fail-fix-reverify rounds on one issue.

## Falsifier

The direction is wrong if the store cannot satisfy a D1–D6 invariant
without modifying existing runtime surfaces (would mean the frozen design
conflicts with repo reality), or if any test needs a consumer wired in to
pass. Cheapest proof: the PR diff contains only new files plus one
`.gitignore` line and the package workflow files; `bun test` green
including the new evidence suites.

## Cheapest Sufficient Proof

- Fresh fetch equals `5228d4ea` at pin time; contract records it.
- New evidence test files pass; full `bun test` green; all root required
  checks green in the worktree.
- `git diff --name-only <base>..HEAD` ⊆ `allowed_paths`; no existing
  `src/` file modified.
- Replay determinism test asserts byte-identical accepted-set output
  across two independent folds of the same log.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Verify fresh fetch equals pinned base `5228d4ea`; fill contract.
- [ ] `src/core/evidence/`: schema types, ULID, idempotency key, fold /
- [ ] `src/effects/evidence/`: append-only store, genesis record, blob
- [ ] Tests for every Goal-5 invariant (red first where feasible).
- [ ] `.gitignore` entry; required checks; commit; receipt; PR.
