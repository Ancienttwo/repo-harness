# Plan: Auto-publish digest-only projection-manifest restamps after Stop drain

> **Status**: Archived
> **Created**: 20260821-0222
> **Slug**: restamp-auto-publication
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Gate matrix + synthesis + convergence tests, drain output shape lock, full Required Checks, one real Stop leaving git status clean
> **Rollback Surface**: Single revert removes the stop-handler call site and new modules; no shell script, policy key, or downstream template touched
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260821-0222-restamp-auto-publication.contract.md`
> **Task Review**: `tasks/reviews/20260821-0222-restamp-auto-publication.review.md`
> **Implementation Notes**: `tasks/notes/20260821-0222-restamp-auto-publication.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260821-0222-restamp-auto-publication.md`
- Sprint contract: `tasks/contracts/20260821-0222-restamp-auto-publication.contract.md`
- Sprint review: `tasks/reviews/20260821-0222-restamp-auto-publication.review.md`
- Implementation notes: `tasks/notes/20260821-0222-restamp-auto-publication.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260821-0222-restamp-auto-publication.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260821-0222-restamp-auto-publication.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260821-0222-restamp-auto-publication.md`.

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
- Contract file: `tasks/contracts/20260821-0222-restamp-auto-publication.contract.md`
- Review file: `tasks/reviews/20260821-0222-restamp-auto-publication.review.md`
- Implementation notes file: `tasks/notes/20260821-0222-restamp-auto-publication.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260821-0222-restamp-auto-publication.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260821-0222-restamp-auto-publication.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Single revert removes the stop-handler call site and new modules; no shell script, policy key, or downstream template touched
- **Verification boundary**: Gate matrix + synthesis + convergence tests, drain output shape lock, full Required Checks, one real Stop leaving git status clean
- **Review/acceptance boundary**: `tasks/reviews/20260821-0222-restamp-auto-publication.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260821-0222-restamp-auto-publication.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260821-0222-restamp-auto-publication.contract.md`, `tasks/reviews/20260821-0222-restamp-auto-publication.review.md`, and `tasks/notes/20260821-0222-restamp-auto-publication.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260821-0222-restamp-auto-publication.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Single revert removes the stop-handler call site and new modules; no shell script, policy key, or downstream template touched

## Captured Planning Output

# Auto-publish digest-only projection-manifest restamps after Stop drain

## Goal

After a successful Stop-gate drain that leaves `docs/architecture/.projection-manifest.json` as the only dirty tracked path (a digest-only restamp), the hook synthesizes a single-path commit on the current branch via `commit-tree` + `update-ref` CAS — so the main checkout's steady state is a clean `git status` and contract-worktree finish's dirty gates stop being permanently hit. Semantic projection deltas are NEVER auto-committed. No push, no drift-cursor writes, no Stop blocking. A manual CLI entry `architecture-projection publish-restamp --json` exposes the same implementation for recovery.

## Why

The permanent ` M .projection-manifest.json` is not cosmetic: `scripts/contract-worktree.sh:1822` and `:2002` both refuse merge on any dirty target worktree, so every finish requires a manual batching commit first (the `e0e575f4` precedent is a forced pre-step, not a convenience). Convergence is proven: `PROJECTION_WORKTREE_IGNORE_PATHS` includes `docs/architecture` (`archctx-provider.ts:48-54`) so the restamp write is a fixed point, and a manifest-only commit yields an all-owned changed set next Stop → drain returns `idle` without running archctx (`projection-orchestrator.ts:81-88`) — no self-excitation loop.

## Frozen decisions

1. **Classifier authority = archctx's own `ProjectionResultV1`, never local manifest parsing**: restamp-only iff `status === 'applied' && files.length === 1 && files[0].path === 'docs/architecture/.projection-manifest.json' && files[0].action === 'update' && humanActions.length === 0`. Semantic deltas necessarily list `.md`/`.likec4` entries → `files.length > 1` → fail closed to current behavior. (Verified against 121 real receipts: 59 noop/empty, 25 restamp-only, 37 semantic.)
2. **Git-side gate (all must hold)**: primary worktree (`--git-dir == --git-common-dir`); HEAD attached to a local branch; index clean; the manifest is the ONLY dirty tracked path in `git status --porcelain=v1 -uall` (untracked files do not block — commit-tree does not read them); skip with advisory when `commit.gpgsign` is true (pinentry would hang inside Stop).
3. **Synthesis recipe** (real index, clean-index precondition avoids temp-index `MM` traps): `git add -- <manifest>` → `git write-tree` → `git commit-tree <tree> -p HEAD -m <msg>` → prove `git diff-tree --no-commit-id --name-only -r HEAD <sha>` lists exactly the manifest (else `git reset -q -- <manifest>` and abandon) → `git update-ref -m <reflog> refs/heads/<branch> <sha> <old>` (CAS, the only commit point). `commit-tree`/`update-ref` run no user hooks — no re-entrancy inside Stop.
4. **Commit message**: `chore(architecture): restamp projection manifest provenance` + trailer `Architecture-Projection-Restamp: <receiptDigest>` (auditable; distinct from contract publications' `Source-Worktree-Head`). No `[skip ci]` — do not invent CI semantics.
5. **Cursor: touch nothing.** Next Stop's changed set is all-owned → existing path returns `idle` with `acknowledgeSourceEvents=true` and advances the cursor itself without running archctx. Drift cursor keeps exactly two writers; auto-publish is not a third.
6. **No push.** Auto-pushing from a Stop hook breaks the ship-gate authority boundary, fails on protected/offline remotes, and puts classifier bugs one step from origin/main. Mandatory advisory instead: on successful publish while `main` is ahead of `origin/main`, print `[ArchitectureProjection] published restamp <sha>; main is ahead of origin/main — push before running acceptance gates.` (this names the one real regression: visible ` M` becomes an invisible `base_ref_unsynchronized` mine at `scripts/verify-sprint.sh:444-453`).
7. **Race handling**: `update-ref <ref> <new> <old>` is git's native CAS — add NO new `withExclusiveDirectoryLock` scope. Second-restamp window (rewrite between `add` and `update-ref`): CAS still lands slightly-stale bytes, manifest re-dirties, next Stop self-heals — advisory only, no in-Stop retry loops. Concurrent Stop: second sees clean manifest → gate fails → no-op. Finish race: no extra guard — today the dirty manifest already gets refused; post-change the failure mode becomes `target branch moved after merge-gate review` (existing, has `finish_transaction_abort` rollback and a deterministic retry that then succeeds). Net improvement.
8. **Failure semantics**: auto-publish wrapped in its own try/catch; strict Stop-gate criteria (`stop-handler.ts:771-793`) unchanged; every failure/skip path exits 0 with one stderr advisory line. No half state: the only durable mutation is the single `update-ref` CAS; any pre-CAS failure runs `git reset -q -- <manifest>`.
9. **No policy knob, no schema change, no `assets/` template change**: behavior binds to the existing `projection_apply === 'automatic'`; downstream generated repos are `projection_provider/apply: disabled` (verified `scripts/lib/project-init-lib.sh:1798-1799`, `scripts/ensure-task-workflow.sh:1150-1151`) and see zero change.
10. **No shell-script modifications** — implementation is TS only (`src/core/architecture/restamp-publication.ts` pure classifier+gate, `src/effects/architecture/restamp-publication.ts` git effect, stop-handler call site, CLI subcommand). Keeps byte-identity/ownership tests untouched.
11. **`drain --json` operator output byte-shape unchanged** — publish logic lives outside the drain; a test locks the drain output shape.
12. **Do NOT revert restamps** (`git checkout --` on machine-owned output re-derives authority locally and can regress `semanticBaseline` — forbidden design space).

## Out of scope

- Relaxing `verify-sprint` `base_ref_unsynchronized` to `merge-base --is-ancestor` (companion finding; separate ship-gate work-package needing its own review).
- archctx-side provenance sidecar split (the true endgame; cross-repo/release — if archctx ships it, this rail becomes deletable).
- Any push automation; any drift-cursor writer; any shell-script change; any policy key.

## Task Breakdown

- [x] Slice 1 — pure classifier + gate evaluator: `src/core/architecture/restamp-publication.ts` (`isManifestRestampOnly(result)`, `evaluateRestampGate(facts)` taking pre-collected git facts) + `tests/architecture-restamp-classifier.test.ts` with fixtures from the three real receipt shapes. Verify: `bun test tests/architecture-restamp-classifier.test.ts --timeout 60000`
- [x] Slice 2 — commit-synthesis effect: `src/effects/architecture/restamp-publication.ts` (collect git facts → recipe per frozen decision 3 → structured result, never throws outward) + real-temp-git-repo tests: synthesis correctness (diff-tree exactly one path, clean status after, staged/untracked preserved), CAS refusal (ref moved), index restoration on abandonment, gpgsign skip. Verify: `bun test tests/architecture-restamp-publication.test.ts --timeout 60000`
- [x] Slice 3 — Stop wiring: call site in `src/cli/hook/stop-handler.ts` after cursor advance (~:722), own try/catch, stderr advisory incl. ahead-of-origin warning; new assertions: never-blocks-Stop (every failure path exit 0), strict-gate criteria set unchanged. Verify: `bun test tests/stop-*.test.ts tests/architecture-*.test.ts --timeout 60000`
- [x] Slice 4 — manual entry: `architecture-projection publish-restamp --json` subcommand sharing the implementation; add a test locking `drain --json` output shape unchanged. Verify: `bun test tests/architecture-projection-*.test.ts tests/cli/ --timeout 60000`
- [x] Slice 5 — docs + full gates: update `docs/reference-configs/sprint-contracts.md` manifest-ownership paragraph and its `assets/reference-configs/` mirror (prose only — mirror parity test must stay green); run all Required Checks (`bun test --timeout 60000`, `check-deploy-sql-order.sh`, `check-architecture-sync.sh`, `check-task-sync.sh`, `check-task-workflow --strict`, `inspect-project-state.ts`, `init --repo . --dry-run`); manually confirm one real Stop leaves `git status` clean. 

## Exit Criteria

1. A drain-produced digest-only restamp on the primary checkout is auto-committed: single-path commit (diff-tree proof), correct message + trailer, `git status` clean afterward.
2. A semantic projection delta (files.length > 1) is never auto-committed — behavior identical to today.
3. Gate matrix honored: detached HEAD / dirty index / other dirty tracked paths / linked worktree / gpgsign=true all skip with advisory, exit 0.
4. Two consecutive Stops converge: second is a no-op and does not invoke archctx.
5. Staged content and untracked files are never swept into the auto-commit.
6. `drain --json` output shape is byte-stable vs before (locked by test); strict Stop-gate behavior unchanged.
7. `publish-restamp --json` manual entry works against a prepared dirty-manifest fixture.
8. Full Required Checks green; no shell script modified (byte-identity tests green).

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Slice 1 — pure classifier + gate evaluator: `src/core/architecture/restamp-publication.ts` (`isManifestRestampOnly(result)`, `evaluateRestampGate(facts)` taking pre-collected git facts) + `tests/architecture-restamp-classifier.test.ts` with fixtures from the three real receipt shapes. Verify: `bun test tests/architecture-restamp-classifier.test.ts --timeout 60000`
- [x] Slice 2 — commit-synthesis effect: `src/effects/architecture/restamp-publication.ts` (collect git facts → recipe per frozen decision 3 → structured result, never throws outward) + real-temp-git-repo tests: synthesis correctness (diff-tree exactly one path, clean status after, staged/untracked preserved), CAS refusal (ref moved), index restoration on abandonment, gpgsign skip. Verify: `bun test tests/architecture-restamp-publication.test.ts --timeout 60000`
- [x] Slice 3 — Stop wiring: call site in `src/cli/hook/stop-handler.ts` after cursor advance (~:722), own try/catch, stderr advisory incl. ahead-of-origin warning; new assertions: never-blocks-Stop (every failure path exit 0), strict-gate criteria set unchanged. Verify: `bun test tests/stop-*.test.ts tests/architecture-*.test.ts --timeout 60000`
- [x] Slice 4 — manual entry: `architecture-projection publish-restamp --json` subcommand sharing the implementation; add a test locking `drain --json` output shape unchanged. Verify: `bun test tests/architecture-projection-*.test.ts tests/cli/ --timeout 60000`
- [x] Slice 5 — docs + full gates: update `docs/reference-configs/sprint-contracts.md` manifest-ownership paragraph and its `assets/reference-configs/` mirror (prose only — mirror parity test must stay green); run all Required Checks (`bun test --timeout 60000`, `check-deploy-sql-order.sh`, `check-architecture-sync.sh`, `check-task-sync.sh`, `check-task-workflow --strict`, `inspect-project-state.ts`, `init --repo . --dry-run`); manually confirm one real Stop leaves `git status` clean. 
