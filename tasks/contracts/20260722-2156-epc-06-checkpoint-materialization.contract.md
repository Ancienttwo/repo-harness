# Task Contract: epc-06-checkpoint-materialization

> **Status**: Active
> **Plan**: plans/plan-20260722-2156-epc-06-checkpoint-materialization.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Reviewer**: Claude
> **Waiver Policy**: user_waiver allowed, owner kito only, per Acceptance Policy below
> **Base SHA**: `321248e4bddb7dbe830c2f2ea0fa4cb928da9134` (pinned per R1 post-EPC-05: fresh fetch after EPC-05 merged (PR carrying the checks-materializer cutover) plus its row-flip commit; verified equal to this worktree's HEAD at task start)
> **Target Branch**: main (via one independent PR)
> **Working Branch**: `codex/epc-06-checkpoint-materialization`
> **PR Unit**: one PR carrying the pure checkpoint projection module, the transactional checkpoint store, the additive Stop wiring, the red-first test suite, and this package's workflow artifacts
> **Capability ID**: root
> **Last Updated**: 2026-07-22 21:56
> **Review File**: `tasks/reviews/20260722-2156-epc-06-checkpoint-materialization.review.md`
> **Notes File**: `tasks/notes/20260722-2156-epc-06-checkpoint-materialization.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

EPC-06 implements Sprint C backlog row 10: checkpoint materialization. EPC-07's
recovery views and EPC-08's Context Packet each need one canonical "state of
the worktree's evidence" artifact to materialize from, or they would each
re-fold the ledger independently with their own drift risk. D1 makes
compaction checkpoint-driven and D8 makes projections provable; this package
supplies that checkpoint as a single atomic transaction so a crash cannot
publish a half-generated state and a hand-edited Markdown view can never flow
back into authority.

## Goal

1. `src/core/evidence/checkpoint.ts` (pure, no fs): canonical machine
   projection of the accepted event set -- deterministic fold output (same
   accepted events => byte-identical projection), carrying `checkpoint_id`
   (content-addressed: `chk-<sha256 hex>` of the deterministic body, not a
   random/time ULID like `event_id`), covered event ids, per-event-type
   latest accepted summaries, subject identities + trust classes, and the
   full D8 provenance block (`source_checkpoint_id` = its own id,
   self-referential; `source_event_ids` = the folded accepted ids;
   `subject_hash`/`contract_id` = `null`, since a checkpoint is a
   whole-ledger snapshot, not filtered to one subject/contract like
   `checks-materializer.ts`; `content_hash` self-consistent). A pure human
   view Markdown renderer derives ONLY from the machine projection object
   (never repo state), byte-deterministic.
2. `src/effects/evidence/checkpoint-store.ts` (IO): one `publishCheckpoint`
   transaction -- stage the machine JSON + derived human Markdown into a temp
   staging directory under `.ai/harness/evidence/checkpoints/`, validate the
   staged bytes from scratch (schema-complete, content_hash self-consistent,
   human view re-derivable byte-identically from the staged machine file),
   then atomically rename into a content-addressed location and update a
   `last-published.json` marker that always points at the newest complete
   checkpoint. Any validation failure rejects the whole stage (nothing
   published, marker unmoved, staging cleaned up). Reader API
   (`resolveLastPublishedCheckpoint`): resolve the marker, then load + validate
   the checkpoint it names; never scans the directory for "the newest" --
   marker-pointing-at-incomplete/missing content is a typed
   `CheckpointResolutionError`, never a fallback scan.
3. Stop wiring (additive, in `src/cli/hook/stop-handler.ts`): at the
   handler's existing single checkpoint-transaction point (immediately after
   `StopProjectionBatch.commit()` / `observeProjectionTransaction?.()`),
   publish a checkpoint of the current accepted set via
   `publishCheckpointFromLedger`. A worktree with no ledger yet is a quiet,
   expected skip (`{status:"skipped", reason:"no-ledger"}` -- no exception,
   no filesystem writes); any other unexpected fault is caught the same way
   `consumePendingPostEditEvents` already is, so this best-effort publish can
   never block, reorder, or alter Stop's existing
   handoff/resume/event/run-summary outputs. Existing
   handoff/resume/current/task-handoff writers are untouched (EPC-07 owns
   their retirement).
4. Markdown-never-authority proof: a test hand-edits the published human view
   and shows (a) the next publish of the same accepted set fully overwrites
   it, and (b) no code path outside the store's own write path reads the
   human-view filename back (grep-based assertion over `src/` + `scripts/`).
5. Tests red-first (`tests/evidence-checkpoint.test.ts`): determinism (two
   independent folds of the same accepted set => byte-identical machine JSON
   + human view); D8 provenance completeness/self-consistency; supersedes
   exclusion (a superseded event is never covered); per-event-type latest
   summaries; staged-install atomicity (unparseable / schema-incomplete /
   content-hash-mismatched / human-view-mismatched stages are all rejected,
   marker unmoved, prior checkpoint still resolvable); simulated crash
   sequences (stage-only debris; a fully renamed-but-never-marked checkpoint)
   leave the prior published checkpoint resolvable and prove there is no
   directory-scan fallback; marker fail-closed on a dangling pointer and on
   malformed marker JSON, benign not-found on an absent marker; cannot-bind
   (no genesis) skips quietly with zero filesystem writes; a genesis with
   zero accepted events still publishes a valid empty checkpoint; live-ish
   integration building a fixture ledger through the real EPC-01 API,
   publishing, and reading back via the reader API, proving
   `provenance.source_event_ids` resolve to real accepted ledger events.
6. All root required checks green; full `bun test` green (including
   `tests/stop-handler.test.ts` unmodified and green, proving the additive
   wiring preserves its frozen four-target-projection/single-resolution
   semantics); one independent PR on `codex/epc-06-checkpoint-materialization`.

## Scope

- In scope: `src/core/evidence/checkpoint.ts`,
  `src/effects/evidence/checkpoint-store.ts`, `src/cli/hook/stop-handler.ts`
  (the additive publish-call wiring only -- no existing line removed,
  reordered, or altered), `tests/evidence-checkpoint.test.ts`, this package's
  plan/contract/review/notes, `tasks/todos.md` projection,
  `.ai/harness/worktrees/epc-06-checkpoint-materialization.json`.
- Out of scope: retiring or modifying handoff/resume/current/task-handoff
  writers (EPC-07); `checks-materializer.ts` / `verify-producer.ts` /
  `verify-sprint.sh` (EPC-05 surfaces, frozen, read-only pattern reference
  only); EPC-01 store/fold modules (`src/core/evidence/fold.ts`,
  `src/core/evidence/types.ts`, `src/effects/evidence/event-log.ts`,
  `blob-store.ts`, `event-writer.ts`, `epoch.ts`, `paths.ts`,
  `atomic-append.ts` -- read-only imports/pattern reference only); Context
  Packet (EPC-08); `tasks/current.md`; the sprint document; any new npm
  dependency. `src/cli/hook/stop-handler.ts` is a direct TypeScript module,
  not a curated/projected file (confirmed: no `assets/hooks` or `.ai/hooks`
  mirror exists for it), so no mirror/digest sync is needed; the Stop path is
  TypeScript, not bash, so no `scripts/` CLI entry is needed either.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if `origin/main` has moved past
  `321248e4bddb7dbe830c2f2ea0fa4cb928da9134` before this package's worktree
  was created -- re-fetch and re-audit, never silently re-pin.
- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if the Stop handler cannot take additive checkpoint-publish wiring
  without changing its HRD-05/HRD-06 frozen semantics (the exact four-target
  projection batch, the single `getStopEffectiveState()` resolution, existing
  stdout/stderr shape) -- report for a scope ruling rather than altering
  existing lines.
- Stop if `check-architecture-sync` BLOCKS (not merely advises) on the
  changed capability surfaces -- report rather than editing `.ai/context/` or
  architecture files.
- Stop after three fail-fix-reverify rounds on one issue.

## Falsifier

The direction is wrong if a deterministic machine projection cannot be
derived from the accepted set alone (i.e. the human view would need direct
repo observation), or if atomic publish cannot be built on this filesystem's
rename semantics. Cheapest proof: the determinism test (byte-identical
projections across two independent folds) and the crash-sequence fixtures
pass, and a live-ish integration test (fixture ledger built through the real
EPC-01 API) publishes a checkpoint whose marker and provenance read back
correctly.

## Root Cause Evidence

Not applicable: Task Profile is `code-change`, not `bugfix`.

## Workflow Inventory

- Source plan: `plans/plan-20260722-2156-epc-06-checkpoint-materialization.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260722-2156-epc-06-checkpoint-materialization.review.md`
- Notes file: `tasks/notes/20260722-2156-epc-06-checkpoint-materialization.notes.md`
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
  - plans/plan-20260722-2156-epc-06-checkpoint-materialization.md
  - tasks/contracts/20260722-2156-epc-06-checkpoint-materialization.contract.md
  - tasks/reviews/20260722-2156-epc-06-checkpoint-materialization.review.md
  - tasks/notes/20260722-2156-epc-06-checkpoint-materialization.notes.md
  - src/core/evidence/checkpoint.ts
  - src/effects/evidence/checkpoint-store.ts
  - src/cli/hook/stop-handler.ts
  - tests/evidence-checkpoint.test.ts
  - .ai/harness/worktrees/epc-06-checkpoint-materialization.json
  - tasks/todos.md
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
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - src/core/evidence/checkpoint.ts
    - src/effects/evidence/checkpoint-store.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260722-2156-epc-06-checkpoint-materialization.notes.md
  tests_pass:
    - path: tests/evidence-checkpoint.test.ts
  commands_succeed:
    - bash scripts/check-task-workflow.sh --strict
  manual_checks:
    - "Published checkpoint provenance source_event_ids resolve to accepted ledger events; marker resolves to a complete checkpoint (live readback)"
    - "No code path reads the human Markdown view back (grep assertion green)"
    - "tasks/current.md untouched"
```

## Acceptance Notes (Human Review)

- Functional behavior: a new, independent transaction publishes a
  content-addressed checkpoint (machine JSON + derived human Markdown) of the
  current per-worktree accepted evidence set, atomically, with a
  last-published marker as the sole resolution authority; wired additively
  at Stop's existing single projection-transaction point. No existing
  writer (handoff/resume/current/task-handoff, checks/latest.json) is
  retired, modified, or reordered.
- Edge cases: no ledger yet (quiet skip, zero filesystem writes); an empty
  accepted set (genesis present, zero events -- still publishes a valid
  empty checkpoint); a superseded event (excluded from `covered_events`,
  already folded out by EPC-01's D5 accepted-set logic before this module
  sees it); republishing an unchanged accepted set (idempotent, same
  content-addressed `checkpoint_id`); a hand-edited published human view
  (fully overwritten by the next publish of the same accepted set, since
  re-derivation is part of the store's own validation gate); a dangling
  marker (missing/invalid checkpoint content) fails closed with a typed
  `CheckpointResolutionError`, never a directory scan for "the newest".
- Regression risks: the Stop wiring is purely additive (new import + one new
  try/catch block after the existing projection-transaction commit; no
  existing line removed, reordered, or altered) -- verified by running
  `tests/stop-handler.test.ts` unmodified and green, including its exact
  four-target-projection/single-state-resolution assertion. The checkpoint
  machine JSON is a projection this store writes directly, not an
  `EvidenceEvent` payload, so it intentionally does not pass through the
  event writer's D6 redaction pass; this is safe because its only content is
  already-redacted event fields plus hashes/paths the store itself
  constructs (see module doc comments and notes.md).

## Rollback Point

- Commit / checkpoint: the single commit on
  `codex/epc-06-checkpoint-materialization` before it merges.
- Revert strategy: revert the single PR -- removes the two new checkpoint
  modules, the red-first test suite, and the additive Stop wiring (a
  three-line net change: one import line, one try/catch block). No existing
  consumer (handoff, resume, checks/latest.json, or any EPC-01/EPC-05
  surface) was ever modified, so reverting cannot regress any existing
  behavior; this package's workflow artifacts revert with it. Any already
  gitignored `.ai/harness/evidence/checkpoints/` content from a dogfood run
  is not tracked and requires no cleanup.
