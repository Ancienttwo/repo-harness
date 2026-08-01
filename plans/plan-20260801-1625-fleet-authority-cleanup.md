# Plan: Fleet authority cleanup: gatekeeper respec, repo-level agent removal, doc closeout

> **Status**: Approved
> **Created**: 20260801-1625
> **Slug**: fleet-authority-cleanup
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260801-1625-fleet-authority-cleanup.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260801-1625-fleet-authority-cleanup.md`; after execution revert branch `codex/fleet-authority-cleanup` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260801-1625-fleet-authority-cleanup.contract.md`
> **Task Review**: `tasks/reviews/20260801-1625-fleet-authority-cleanup.review.md`
> **Implementation Notes**: `tasks/notes/20260801-1625-fleet-authority-cleanup.notes.md`

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

- Active plan: `plans/plan-20260801-1625-fleet-authority-cleanup.md`
- Sprint contract: `tasks/contracts/20260801-1625-fleet-authority-cleanup.contract.md`
- Sprint review: `tasks/reviews/20260801-1625-fleet-authority-cleanup.review.md`
- Implementation notes: `tasks/notes/20260801-1625-fleet-authority-cleanup.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260801-1625-fleet-authority-cleanup.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260801-1625-fleet-authority-cleanup.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260801-1625-fleet-authority-cleanup.md`.

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
- Contract file: `tasks/contracts/20260801-1625-fleet-authority-cleanup.contract.md`
- Review file: `tasks/reviews/20260801-1625-fleet-authority-cleanup.review.md`
- Implementation notes file: `tasks/notes/20260801-1625-fleet-authority-cleanup.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260801-1625-fleet-authority-cleanup.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260801-1625-fleet-authority-cleanup.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260801-1625-fleet-authority-cleanup.md`; after execution revert branch `codex/fleet-authority-cleanup` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260801-1625-fleet-authority-cleanup.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260801-1625-fleet-authority-cleanup.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260801-1625-fleet-authority-cleanup.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260801-1625-fleet-authority-cleanup.contract.md`, `tasks/reviews/20260801-1625-fleet-authority-cleanup.review.md`, and `tasks/notes/20260801-1625-fleet-authority-cleanup.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260801-1625-fleet-authority-cleanup.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260801-1625-fleet-authority-cleanup.md`; after execution revert branch `codex/fleet-authority-cleanup` or the explicitly reviewed diff.

## Captured Planning Output

## Goal

Close out two loose ends left by the receipt-awareness work (#148) and the
repo-owned agent fleet authority line:

1. The `### Readiness` prose in `assets/reference-configs/external-tooling.md`
   still describes the pre-#148 drift check, the #148 review artifact is
   uncommitted, and three deferred goals have no ledger entry.
2. `gatekeeper` is the last fleet role still pinned to the retired `fable`
   family, and `.claude/agents/` holds a tracked second copy of the fleet that
   has already drifted from the authored source.

## Verified facts (from repo inspection)

- `assets/reference-configs/external-tooling.md` is the authored source;
  `docs/reference-configs/external-tooling.md` is a generated projection synced
  via `bun scripts/sync-reference-configs.ts --write`/`--check`. Do not edit the
  `docs/` side directly.
- The `### Readiness` section (lines 620-627) still says the check "compares ...
  and reports `drift`/`synced` per agent", which predates #148's receipt
  consultation and the `up-to-date` rollup value.
- `agents/fleet/*.md` is the only authored fleet source.
- `.claude/agents/*.md` is a tracked duplicate of that source, not a golden: the
  installer test compares installed Claude `.md` against `FLEET_SOURCE_DIR`
  (`agents/fleet`), never against `.claude/agents`. The duplicate has already
  drifted - `.claude/agents/fast-worker.md` still declares `model: sonnet` /
  `effort: max` while `agents/fleet/fast-worker.md` is `opus` / `medium`, and
  its boundaries bullet is missing the "or the gate's" clause.
- `.codex/agents/*.toml` **is** a golden, not a duplicate:
  `tests/install-agent-fleet.test.ts:10` binds `GOLDEN_CODEX_DIR` to it and
  line 135 asserts byte-identity `expect(installedCodex).toBe(golden)`;
  `tests/bootstrap-files.test.ts:88` asserts each of the seven exists;
  `.gitignore:73-76` carves it out of the blanket `.codex/*` ignore;
  `docs/architecture/modules/workflow-engine/contract-assets.md:222-223`
  names `.codex/agents/*.toml` a deterministic repo-local projection and golden.
  No script regenerates it - the installer running into a temp HOME is its only
  producer.
- `scripts/install-agent-fleet.sh:140-151` maps the `opus` family to
  `gpt-5.6-terra` with effort carried through unchanged, and keeps exactly two
  per-agent overrides in `AGENT_TARGET_OVERRIDES` (`fast-worker` down to Luna at
  max, `deep-worker` up to Terra at xhigh).

## Design decision

`.claude/agents/` and `.codex/agents/` look symmetric but are not, so they are
treated differently:

- `.claude/agents/` is removed. It is a second authority for content
  `agents/fleet/` already owns, and it has already produced a real stale copy.
  Removing it makes in-repo spawn resolve to the user-level install, which is
  the same content the installer writes from `agents/fleet/`.
- `.codex/agents/` is kept and regenerated. Deleting it would force either
  dropping the byte-identity assertion (a test relaxation that stops catching
  TOML escaping, field-order, and heredoc-boundary regressions) or relocating
  golden authority (an architecture decision outside this work package).

Because `gatekeeper`'s frontmatter changes, its golden must be regenerated
through the same path the test uses - run the installer into a temp HOME and
copy the produced `gatekeeper.toml` over the golden - so byte-identity stays
green with zero assertion loosening. The other six goldens must show no diff.

## Behavior spec

1. Rewrite the `### Readiness` paragraph in
   `assets/reference-configs/external-tooling.md` to describe receipt
   consultation, the `user-managed` exemption on its own report line, the
   fail-closed fallthrough cases, and the `up-to-date` rollup value. Re-sync
   the `docs/` projection. No changelog framing, no model version numbers.
2. Commit the existing `tasks/reviews/20260801-1255-tooling-receipt-awareness.review.md`
   unchanged.
3. Add three deferred goals to `tasks/todos.md` in the existing table format
   (tradeoff plus revisit trigger): archiving the #148 plan set, the
   verify-sprint nested-execution environment leak, and the
   `verify-contract.sh --read-only` Status write side effect.
4. Respec `gatekeeper` to `model: opus` / `effort: high` in
   `agents/fleet/gatekeeper.md` (frontmatter plus the description's leading
   model phrase; body unchanged), add a `gatekeeper` entry to
   `AGENT_TARGET_OVERRIDES` projecting to `gpt-5.6-terra` at `xhigh` to match
   the deep-worker precedent, and mirror the installer into
   `assets/templates/helpers/` via `bun scripts/sync-helper-sources.ts --write`.
5. Regenerate `.codex/agents/gatekeeper.toml` from the installer. Verify the
   other six goldens are unchanged.
6. Delete the seven tracked `.claude/agents/*.md`.
7. Update the fleet model-mapping prose in
   `assets/reference-configs/external-tooling.md` for the new gatekeeper row and
   re-sync the projection.
8. Align hardcoded roster/model assertions in `tests/bootstrap-files.test.ts`
   and `tests/install-agent-fleet.test.ts` to the new facts. Assertions move to
   the new expected values only; none are removed or weakened.

## Out of scope

- Archiving `plans/plan-20260801-1255-tooling-receipt-awareness.md` or its
  contract/notes/review (blocked by the verify-sprint harness defect; deferred
  to `tasks/todos.md`).
- `scripts/verify-sprint.sh`, `scripts/verify-contract.sh`, and
  `scripts/run-bounded-verifier.sh` (their defects are deferred, not fixed here).
- `.codex/agents/` deletion, the `.gitignore` carve-out, and every `~/.claude`
  or `~/.codex` HOME target in `.ai/harness/policy.json`,
  `scripts/lib/project-init-lib.sh`, and the `ensure-task-workflow.sh` pair -
  those are product surfaces governing downstream generation.
- Any change under `$HOME`; push, PR, or publish.

## Task Breakdown
- [ ] Rewrite the `### Readiness` paragraph in `assets/reference-configs/external-tooling.md` and re-sync the `docs/` projection.
- [ ] Commit `tasks/reviews/20260801-1255-tooling-receipt-awareness.review.md` unchanged.
- [ ] Add three deferred goals to `tasks/todos.md` with tradeoff and revisit trigger.
- [ ] Respec `agents/fleet/gatekeeper.md` to `opus`/`high` and add the `gatekeeper` Codex projection override to `scripts/install-agent-fleet.sh`.
- [ ] Mirror the installer into `assets/templates/helpers/` via `bun scripts/sync-helper-sources.ts --write`.
- [ ] Regenerate `.codex/agents/gatekeeper.toml` from the installer and confirm the other six goldens are byte-unchanged.
- [ ] Delete the seven tracked `.claude/agents/*.md` files.
- [ ] Update the fleet model-mapping prose for the new gatekeeper row and re-sync the projection.
- [ ] Align roster/model assertions in `tests/bootstrap-files.test.ts` and `tests/install-agent-fleet.test.ts` to the new facts.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Rewrite the `### Readiness` paragraph in `assets/reference-configs/external-tooling.md` and re-sync the `docs/` projection.
- [ ] Commit `tasks/reviews/20260801-1255-tooling-receipt-awareness.review.md` unchanged.
- [ ] Add three deferred goals to `tasks/todos.md` with tradeoff and revisit trigger.
- [ ] Respec `agents/fleet/gatekeeper.md` to `opus`/`high` and add the `gatekeeper` Codex projection override to `scripts/install-agent-fleet.sh`.
- [ ] Mirror the installer into `assets/templates/helpers/` via `bun scripts/sync-helper-sources.ts --write`.
- [ ] Regenerate `.codex/agents/gatekeeper.toml` from the installer and confirm the other six goldens are byte-unchanged.
- [ ] Delete the seven tracked `.claude/agents/*.md` files.
- [ ] Update the fleet model-mapping prose for the new gatekeeper row and re-sync the projection.
- [ ] Align roster/model assertions in `tests/bootstrap-files.test.ts` and `tests/install-agent-fleet.test.ts` to the new facts.
