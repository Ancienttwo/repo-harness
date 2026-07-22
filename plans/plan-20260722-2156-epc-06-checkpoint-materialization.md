# Plan: EPC-06: Checkpoint Materialization Transaction

> **Status**: Executing
> **Created**: 20260722-2156
> **Slug**: epc-06-checkpoint-materialization
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: host-plan
> **Source Ref**: sprint:plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md#epc-06
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Red-first fixtures prove: deterministic byte-identical machine projection and derived human view; staged install atomicity (validation failure publishes nothing, marker unmoved; partial stage rejected; crash sequences leave prior checkpoint discoverable); Markdown never read back (grep assertion) and fully overwritten on next publish; live Stop dogfood publishes a checkpoint whose provenance resolves to accepted ledger events
> **Rollback Surface**: Revert the single PR: new checkpoint modules + tests plus one additive Stop wiring site; no existing writer retired or modified; existing recovery surfaces unchanged
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260722-2156-epc-06-checkpoint-materialization.contract.md`
> **Task Review**: `tasks/reviews/20260722-2156-epc-06-checkpoint-materialization.review.md`
> **Implementation Notes**: `tasks/notes/20260722-2156-epc-06-checkpoint-materialization.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: sprint:plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md#epc-06
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260722-2156-epc-06-checkpoint-materialization.md`
- Sprint contract: `tasks/contracts/20260722-2156-epc-06-checkpoint-materialization.contract.md`
- Sprint review: `tasks/reviews/20260722-2156-epc-06-checkpoint-materialization.review.md`
- Implementation notes: `tasks/notes/20260722-2156-epc-06-checkpoint-materialization.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260722-2156-epc-06-checkpoint-materialization.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260722-2156-epc-06-checkpoint-materialization.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260722-2156-epc-06-checkpoint-materialization.md`.

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
- Contract file: `tasks/contracts/20260722-2156-epc-06-checkpoint-materialization.contract.md`
- Review file: `tasks/reviews/20260722-2156-epc-06-checkpoint-materialization.review.md`
- Implementation notes file: `tasks/notes/20260722-2156-epc-06-checkpoint-materialization.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260722-2156-epc-06-checkpoint-materialization.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260722-2156-epc-06-checkpoint-materialization.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the single PR: new checkpoint modules + tests plus one additive Stop wiring site; no existing writer retired or modified; existing recovery surfaces unchanged
- **Verification boundary**: Red-first fixtures prove: deterministic byte-identical machine projection and derived human view; staged install atomicity (validation failure publishes nothing, marker unmoved; partial stage rejected; crash sequences leave prior checkpoint discoverable); Markdown never read back (grep assertion) and fully overwritten on next publish; live Stop dogfood publishes a checkpoint whose provenance resolves to accepted ledger events
- **Review/acceptance boundary**: `tasks/reviews/20260722-2156-epc-06-checkpoint-materialization.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260722-2156-epc-06-checkpoint-materialization.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260722-2156-epc-06-checkpoint-materialization.contract.md`, `tasks/reviews/20260722-2156-epc-06-checkpoint-materialization.review.md`, and `tasks/notes/20260722-2156-epc-06-checkpoint-materialization.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260722-2156-epc-06-checkpoint-materialization.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the single PR: new checkpoint modules + tests plus one additive Stop wiring site; no existing writer retired or modified; existing recovery surfaces unchanged

## Captured Planning Output

> **Task Profile**: code-change

## Decision Summary

EPC-06 implements Sprint C backlog row 10: checkpoint materialization. One
transaction turns the accepted event set into a canonical machine
projection and a deterministically derived human view, installed atomically
(stage → validate → rename) with a last-published marker; partial
generation is detected and rejected; the Markdown human view is derived
output only and never becomes writable authority. The checkpoint is the
D1-frozen compaction anchor and the substrate EPC-07's surviving recovery
views will be materialized from. Wiring is additive at the Stop handler's
existing single checkpoint transaction point (HRD-05 semantics); existing
handoff/resume/current writers keep running until EPC-07 retires them.
Base SHA pinned per R1 at fresh fetch:
`321248e4bddb7dbe830c2f2ea0fa4cb928da9134` (post-EPC-05 merge + row flip).

## Why

Recovery views (EPC-07) and the Context Packet (EPC-08) need one canonical
"state of the worktree's evidence" artifact to materialize from, or they
would each re-fold the ledger with their own drift risk. D1 makes
compaction checkpoint-driven and D8 makes projections provable; EPC-06
supplies that checkpoint as a single atomic transaction so a crash cannot
publish a half-generated state and a hand-edited Markdown can never flow
back into authority.

## Goal

1. `src/core/evidence/checkpoint.ts` (pure): canonical machine projection
   of the accepted event set — deterministic fold output (same accepted
   events ⇒ byte-identical projection), carrying the full D8 provenance
   block with `source_checkpoint_id` = its own checkpoint id and
   `source_event_ids` = the folded accepted ids; and a pure renderer
   deriving the human Markdown view from the machine projection only
   (never from repo state directly, never parsed back).
2. `src/effects/evidence/checkpoint-store.ts` (IO): one transaction —
   stage the machine projection and derived human view into a temp
   staging dir under `.ai/harness/evidence/checkpoints/`, validate both
   (schema-complete, content_hash self-consistent, human view derivable
   byte-identically from the staged machine file), then atomically
   rename into place and update a `last-published` marker file that
   always points at the newest complete checkpoint. Any validation
   failure or missing piece rejects the whole stage (nothing published,
   marker unmoved) — partial generation detected and rejected. Crash
   windows (before/after rename, before marker update) leave the
   previous published checkpoint intact and discoverable via the marker.
3. Stop wiring (additive): at the existing single Stop checkpoint
   transaction point, publish a checkpoint of the current accepted set
   (skip quietly when the worktree has no ledger — cannot-bind
   discipline, exit-code style consistent with EPC-02's wrapper if a CLI
   surface is needed). Existing handoff/resume/current writers are NOT
   touched (EPC-07 owns their retirement).
4. Markdown-never-authority proof: a test hand-edits the published human
   view and shows (a) the next checkpoint fully overwrites it, (b) no
   code path reads the Markdown back (grep-based assertion over src/
   scripts/ for readers of the human-view filename).
5. Tests red-first: determinism (same accepted set ⇒ byte-identical
   machine projection and human view); staged-install atomicity
   (validation failure ⇒ nothing published, marker unmoved; simulated
   partial stage ⇒ rejected); marker always resolves to a complete
   checkpoint after simulated crash sequences; derived-view fidelity
   (human view regenerable byte-identically from the machine file);
   supersedes/compaction hook honored (checkpoint records which events
   it covers so D1 archive-after-checkpoint has its anchor).
6. All root required checks green; full `bun test` green; one
   independent PR on `codex/epc-06-checkpoint-materialization`.

## P1: Architecture Map

- Design authority: frozen D1 (checkpoint-driven compaction, cleanup
  ownership), D5 (replay determinism), D8 (provenance); EPC-01 fold and
  store APIs read-only; EPC-05 materializer untouched (checks/latest
  stays its own projection — the checkpoint does not replace it in this
  row).
- Stop surface: locate the HRD-05/HRD-06 single Stop checkpoint
  transaction point (stop-handler path in src/cli/hook/) and wire
  additively there; the Stop handler's existing semantics (readiness +
  flush + one checkpoint transaction) must not change shape.
- EPC-07 dependency: the checkpoint id + machine projection are the
  input contract for recovery-view materializers; keep the machine
  schema minimal but complete (accepted events summary, subject
  identities, trust classes, latest per event_type, provenance).

## P2: Concrete Trace

EPC-05 merges -> `main` at `321248e4` -> EPC-06 fresh-fetches, pins it
(R1) -> worktree opens on `codex/epc-06-checkpoint-materialization` ->
pure checkpoint projection + transactional store + Stop wiring + tests
land -> this package's own Stop/acceptance activity publishes a real
checkpoint in the worktree (dogfood readback: marker resolves, provenance
resolves to accepted events) -> full suite green -> receipt (via worktree
scripts, not the global CLI) -> one PR merges -> EPC-07 pins its base.

## P3: Design Decision

- Machine projection is the single authority; the human view is a pure
  function of it. Deriving Markdown from repo state directly would give
  it independent observation power — the exact dual-authority D9/R5
  forbid.
- Staged install + marker (temp + validate + rename) follows the
  session-context-budget temp-file+rename precedent and EPC-01's
  fail-closed discipline; the marker gives EPC-07/08 an O(1) "newest
  complete checkpoint" lookup without directory mtime scans (D7 bans
  mtime ordering everywhere).
- Additive Stop wiring, not a cutover: R5 assigns writer retirement to
  EPC-07; publishing alongside existing writers keeps this package's
  blast radius to new files plus one wiring site.
- Checkpoint lives under the gitignored evidence root: same D1 lifecycle
  as events/blobs (per-worktree, cleanup at worktree finish).

## Task Breakdown

- [ ] Verify fresh fetch equals pinned base `321248e4`; fill contract.
- [ ] Pure checkpoint projection + human-view renderer (red-first).
- [ ] Transactional checkpoint store (stage/validate/rename/marker).
- [ ] Stop wiring (additive, cannot-bind skip).
- [ ] Markdown-never-authority tests; crash/partial fixtures.
- [ ] Required checks; commit; receipt via worktree scripts; PR.

## Scope

- In scope: `src/core/evidence/checkpoint.ts`,
  `src/effects/evidence/checkpoint-store.ts`, the Stop handler wiring
  site (exact file determined by reading the HRD-06 stop-handler slim
  module; wiring only), a thin CLI/entry only if the Stop path is bash
  and needs one (mirror-sync rules apply if any curated helper is
  touched), `tests/evidence-checkpoint.test.ts`, this package's
  plan/contract/review/notes, `tasks/todos.md` projection,
  `.ai/harness/worktrees/epc-06-checkpoint-materialization.json`.
- Out of scope: retiring or modifying handoff/resume/current/task-handoff
  writers (EPC-07); checks/latest materializer and verify producer
  (EPC-05 surfaces, frozen); Context Packet (EPC-08); EPC-01 store/fold
  modules; `tasks/current.md`; the sprint document; any new npm
  dependency.
- Non-goals: event archive/compaction execution (D1 gives the anchor;
  actual archive moves are worktree-finish lifecycle, not this row);
  recovery-view schemas.

## Stop Conditions

- Stop if `origin/main` moves past `321248e4` before worktree creation.
- Stop if the Stop handler cannot take an additive wiring without
  changing its HRD-frozen semantics — report for a scope ruling.
- Stop after three fail-fix-reverify rounds on one issue.

## Falsifier

The direction is wrong if a deterministic machine projection cannot be
derived from the accepted set alone (i.e. the human view would need
direct repo observation), or if atomic publish cannot be built on this
filesystem's rename semantics. Cheapest proof: the determinism test
(byte-identical projections across two independent folds) and the
crash-sequence fixtures pass, and a live Stop in this worktree publishes
a checkpoint whose marker and provenance read back correctly.

## Cheapest Sufficient Proof

- Fresh fetch equals `321248e4` at pin time; contract records it.
- Red-first checkpoint suite green; full `bun test` green; root checks
  green in the worktree.
- Live readback: published checkpoint's provenance `source_event_ids`
  resolve to accepted ledger events; marker points at it; hand-edited
  human view fully overwritten on next publish.
- `git diff --name-only <base>..HEAD` ⊆ `allowed_paths`.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Verify fresh fetch equals pinned base `321248e4`; fill contract.
- [x] Pure checkpoint projection + human-view renderer (red-first).
- [x] Transactional checkpoint store (stage/validate/rename/marker).
- [x] Stop wiring (additive, cannot-bind skip).
- [x] Markdown-never-authority tests; crash/partial fixtures.
- [ ] Required checks; commit; receipt via worktree scripts; PR. (required checks green and one commit land in this package; receipt-via-worktree-scripts and PR are the orchestrator's/gatekeeper's follow-on step, out of this dispatch's scope)
