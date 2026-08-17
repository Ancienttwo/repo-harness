# Plan: Single typed selector and classified fail-closed boundaries for contract-worktree base metadata

> **Status**: Archived
> **Created**: 20260818-0509
> **Slug**: worktree-metadata-authority
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260818-0509-worktree-metadata-authority.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260818-0509-worktree-metadata-authority.md`; after execution revert branch `codex/worktree-metadata-authority` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260818-0509-worktree-metadata-authority.contract.md`
> **Task Review**: `tasks/reviews/20260818-0509-worktree-metadata-authority.review.md`
> **Implementation Notes**: `tasks/notes/20260818-0509-worktree-metadata-authority.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan-or-waza-think planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260818-0509-worktree-metadata-authority.md`
- Sprint contract: `tasks/contracts/20260818-0509-worktree-metadata-authority.contract.md`
- Sprint review: `tasks/reviews/20260818-0509-worktree-metadata-authority.review.md`
- Implementation notes: `tasks/notes/20260818-0509-worktree-metadata-authority.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260818-0509-worktree-metadata-authority.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260818-0509-worktree-metadata-authority.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260818-0509-worktree-metadata-authority.md`.

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
- Contract file: `tasks/contracts/20260818-0509-worktree-metadata-authority.contract.md`
- Review file: `tasks/reviews/20260818-0509-worktree-metadata-authority.review.md`
- Implementation notes file: `tasks/notes/20260818-0509-worktree-metadata-authority.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260818-0509-worktree-metadata-authority.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260818-0509-worktree-metadata-authority.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260818-0509-worktree-metadata-authority.md`; after execution revert branch `codex/worktree-metadata-authority` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260818-0509-worktree-metadata-authority.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260818-0509-worktree-metadata-authority.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260818-0509-worktree-metadata-authority.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260818-0509-worktree-metadata-authority.contract.md`, `tasks/reviews/20260818-0509-worktree-metadata-authority.review.md`, and `tasks/notes/20260818-0509-worktree-metadata-authority.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260818-0509-worktree-metadata-authority.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260818-0509-worktree-metadata-authority.md`; after execution revert branch `codex/worktree-metadata-authority` or the explicitly reviewed diff.

## Captured Planning Output

## Goal

One typed selector chooses exactly one contract-worktree metadata record, and both the diff-base resolver and the staleness guard consume that same record. Every state that is neither "no matching metadata" nor "verified current" fails closed with a distinct, accurate cause.

## Problem

Reproduced locally against `04c405ed`:

1. **Selector bypass.** `contract_worktree_metadata_rows` skips only rows that serialize to the empty string. A matching record with every field empty serializes to `\x1f\x1f`, which is not empty. The guard takes `head -1`, decodes empty fields, returns silently; the resolver skips that row and uses the stale base from the next one. The function's own comment claims guard and resolver must agree on the record; they do not.
2. **Optional dependency silently disables the gate.** `command -v jq || return 1` becomes "no rows" at the guard, so on a machine without `jq` — documented as optional — a stale base passes with no output.
3. **Writer and checker disagree on the field's meaning.** `contract-worktree.sh` records `base_commit = source HEAD` for a new branch and `merge-base(HEAD, base_branch)` for a reused one; the guard asserts the second form unconditionally. Starting from a parent branch ahead of the target reports "was rebased" when no rebase happened.

Two further shapes follow from the single-value comparison and were not reproduced here: criss-cross history where `git merge-base` may return any of several best bases, and a local `base_branch` lagging its upstream.

## Task Breakdown

- [ ] Replace `contract_worktree_metadata_rows` with `contract_worktree_selected_metadata`, emitting one record carrying `source_file`, `match_kind`, `base_commit`, `base_branch`, `started_at`. Exact-worktree match wins; more than one exact match fails closed; branch match only when no exact match exists; more than one branch match fails closed. No matching record at all stays the single silent path.
- [ ] Fail closed when metadata files exist but `jq` is unavailable, and when a selected file is invalid JSON, naming the file in both cases.
- [ ] Point `contract_worktree_base_commit` at the selected record, keeping its existing per-record fallback chain.
- [ ] Rewrite the guard to validate the effective base the resolver will return, so agreement holds by construction rather than by comment.
- [ ] Classify failures distinctly instead of always claiming a rebase: `metadata_malformed`, `base_ref_unresolvable`, `base_ref_unsynchronized`, `no_common_ancestor`, `ambiguous_merge_base`, `stacked_source_start`, `stale_base_commit`.
- [ ] Use `git merge-base --all`; zero bases and more than one base are their own classes, never "stale".
- [ ] When `base_branch` has a remote-tracking counterpart and the two disagree, fail `base_ref_unsynchronized` with the fetch instruction. No network access from the guard.
- [ ] Discriminate `stacked_source_start` from `stale_base_commit` by whether the recorded base is an ancestor of `base_branch`. Both fail closed: publication would carry the parent branch's commits into the target without them appearing in the contract's own scope.
- [ ] Return early when `REPO_HARNESS_DIFF_BASE` or `HARNESS_DIFF_BASE` is set, since metadata is not the diff base then.
- [ ] Mirror byte-identically into `assets/templates/helpers/verify-sprint.sh`.
- [ ] Extend `tests/verify-sprint-rebase-base-guard.test.ts` with the reproduced and reasoned shapes: empty-first-row plus stale-second-row, duplicate exact rows, exact row alongside branch row, missing `base_branch`, unresolvable `base_branch`, invalid JSON, stacked source start, criss-cross ambiguity, stale local target against a current remote-tracking ref, and an explicit diff-base override with stale metadata.

## Non-goals

No change to `contract-worktree start`, no `scope_origin_commit` / `integration_base_commit` field split, no `base_epoch`, no automatic metadata refresh, no network access from `verify-sprint`. Whether stacked contract worktrees become a supported shape is a separate product decision; this package only stops mislabelling them.

## Verification

- `bun test tests/verify-sprint-rebase-base-guard.test.ts`
- `bun test`
- `bun run check:type`

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Replace `contract_worktree_metadata_rows` with `contract_worktree_selected_metadata`, emitting one record carrying `source_file`, `match_kind`, `base_commit`, `base_branch`, `started_at`. Exact-worktree match wins; more than one exact match fails closed; branch match only when no exact match exists; more than one branch match fails closed. No matching record at all stays the single silent path.
- [ ] Fail closed when metadata files exist but `jq` is unavailable, and when a selected file is invalid JSON, naming the file in both cases.
- [ ] Point `contract_worktree_base_commit` at the selected record, keeping its existing per-record fallback chain.
- [ ] Rewrite the guard to validate the effective base the resolver will return, so agreement holds by construction rather than by comment.
- [ ] Classify failures distinctly instead of always claiming a rebase: `metadata_malformed`, `base_ref_unresolvable`, `base_ref_unsynchronized`, `no_common_ancestor`, `ambiguous_merge_base`, `stacked_source_start`, `stale_base_commit`.
- [ ] Use `git merge-base --all`; zero bases and more than one base are their own classes, never "stale".
- [ ] When `base_branch` has a remote-tracking counterpart and the two disagree, fail `base_ref_unsynchronized` with the fetch instruction. No network access from the guard.
- [ ] Discriminate `stacked_source_start` from `stale_base_commit` by whether the recorded base is an ancestor of `base_branch`. Both fail closed: publication would carry the parent branch's commits into the target without them appearing in the contract's own scope.
- [ ] Return early when `REPO_HARNESS_DIFF_BASE` or `HARNESS_DIFF_BASE` is set, since metadata is not the diff base then.
- [ ] Mirror byte-identically into `assets/templates/helpers/verify-sprint.sh`.
- [ ] Extend `tests/verify-sprint-rebase-base-guard.test.ts` with the reproduced and reasoned shapes: empty-first-row plus stale-second-row, duplicate exact rows, exact row alongside branch row, missing `base_branch`, unresolvable `base_branch`, invalid JSON, stacked source start, criss-cross ambiguity, stale local target against a current remote-tracking ref, and an explicit diff-base override with stale metadata.
