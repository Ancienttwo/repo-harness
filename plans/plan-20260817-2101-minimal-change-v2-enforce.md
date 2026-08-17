# Plan: minimal_change v2 enforce: Stop block + circuit breaker

> **Status**: Executing
> **Created**: 20260817-2101
> **Slug**: minimal-change-v2-enforce
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Execution Mode**: primary
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: bun test full baseline + stop-gate live smoke + gatekeeper acceptance
> **Rollback Surface**: single commit revert; per-repo mode=advice restores v1
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260817-2101-minimal-change-v2-enforce.contract.md`
> **Task Review**: `tasks/reviews/20260817-2101-minimal-change-v2-enforce.review.md`
> **Implementation Notes**: `tasks/notes/20260817-2101-minimal-change-v2-enforce.notes.md`

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

- Active plan: `plans/plan-20260817-2101-minimal-change-v2-enforce.md`
- Sprint contract: `tasks/contracts/20260817-2101-minimal-change-v2-enforce.contract.md`
- Sprint review: `tasks/reviews/20260817-2101-minimal-change-v2-enforce.review.md`
- Implementation notes: `tasks/notes/20260817-2101-minimal-change-v2-enforce.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260817-2101-minimal-change-v2-enforce.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260817-2101-minimal-change-v2-enforce.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260817-2101-minimal-change-v2-enforce.md`.

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
- Contract file: `tasks/contracts/20260817-2101-minimal-change-v2-enforce.contract.md`
- Review file: `tasks/reviews/20260817-2101-minimal-change-v2-enforce.review.md`
- Implementation notes file: `tasks/notes/20260817-2101-minimal-change-v2-enforce.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260817-2101-minimal-change-v2-enforce.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260817-2101-minimal-change-v2-enforce.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: single commit revert; per-repo mode=advice restores v1
- **Verification boundary**: bun test full baseline + stop-gate live smoke + gatekeeper acceptance
- **Review/acceptance boundary**: `tasks/reviews/20260817-2101-minimal-change-v2-enforce.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260817-2101-minimal-change-v2-enforce.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260817-2101-minimal-change-v2-enforce.contract.md`, `tasks/reviews/20260817-2101-minimal-change-v2-enforce.review.md`, and `tasks/notes/20260817-2101-minimal-change-v2-enforce.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260817-2101-minimal-change-v2-enforce.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: single commit revert; per-repo mode=advice restores v1

## Captured Planning Output

# minimal_change v2: enforce mode with Stop block and circuit breaker

## Context

`minimal_change` v1 shipped advisory-only (3aa1dbbf); `mode: 'enforce'` was reserved but explicitly downgraded to `advice` in `normalizeMode` (`src/cli/hook/minimal-change-policy.ts:101-107`), and `blocking: false` was locked as a literal type. The v1 observer was energized in this repo at 868d5b4e (`post_edit_observer: true`). The user has now decided (2026-08-17, explicit product intent + strength choice): implement enforce as **Stop block + circuit breaker**, matching the existing ArchitectureProjection strict-gate precedent.

## Approved decisions (frozen)

1. **Type layer**: `MinimalChangeMode` becomes `'off' | 'advice' | 'enforce'`. `normalizeMode` accepts `enforce` (remove the v1 downgrade+warning path; `MinimalChangeRawMode` collapses into `MinimalChangeMode`). `blocking` becomes a computed `readonly blocking: boolean` = `mode === 'enforce'`. No new policy knobs; `mode` stays the single source of truth.
2. **Trigger**: existing `verdict === 'review'` from `.ai/harness/checks/minimal-change.latest.json` (findings-based, deterministic; no numeric thresholds in v2).
3. **Gate behavior**: in `stop-handler.ts`, when `mode === 'enforce'` and latest report verdict is `review` and no matching audit receipt exists, return `block(reason)`. The reason is self-contained: lists the findings, states the receipt contract, and recommends the `reclaim-code-entropy` skill as methodology if installed (the gate contract must NOT depend on skill presence).
4. **Audit receipt**: `.ai/harness/checks/minimal-change-audit.latest.json` with at minimum `{ version, fingerprint, decisions, generated_at }` where `fingerprint` must equal the audited report's `fingerprint`. Gate releases when they match. Covered by the existing `.gitignore` `*.latest.json` pattern — runtime cache, never committed.
5. **Circuit breaker**: reuse the existing `src/cli/hook/circuit-breaker.ts` module and its persisted state (`.ai/harness/state/circuit-breaker.json`) via `recordCircuitAttempt`, keyed per report fingerprint. Limit: at most 2 blocks per fingerprint (align with `circuit_breakers.repair_loops: 2` semantics or add a dedicated attempt kind following the module's existing pattern). When tripped, Stop releases with a non-blocking warning suffix instead of blocking.
6. **Defaults unchanged**: `minimal-change-policy.ts` defaults and `assets/` templates stay `mode: 'advice'`, `post_edit_observer: false`. Enforce is per-repo opt-in. This repo's `.ai/harness/policy.json` flips `minimal_change.mode` to `'enforce'` in this slice.
7. **reclaim-code-entropy stays a global skill**, not entering `assets/skills/`: the gate contract depends only on the receipt file, keeping the contract chain free of external skill coupling.
8. **Docs**: update `docs/reference-configs/minimal-change-hooks.md` and its `assets/reference-configs/` twin in sync ("enforce is treated as advisory" language must go). CHANGELOG entry per existing convention. Before editing any docs/README surface, grep `tests/readme-dx.test.ts` and related tests for literal-string assertions.
9. **Contract manifests**: check whether `assets/workflow-contract.v1.json` / `.ai/harness/workflow-contract.json` encode the minimal-change layer; if yes, update both in sync.

## Task Breakdown

- [ ] Type + normalize: enforce accepted, blocking computed; update/extend `tests/minimal-change-policy.test.ts` (the "enforce normalized to advice" assertions must flip to the new contract, fail-closed on unknown modes unchanged).
- [ ] Stop gate: block/release/receipt-mismatch/breaker-trip paths in `stop-handler.ts` + tests (including regression: `mode: 'advice'` stays non-blocking end to end).
- [ ] Receipt reader: strict validation, malformed receipt = no release (fail closed), tests.
- [ ] Circuit breaker binding + tests.
- [ ] Policy flip in this repo + docs + manifests sync.
- [ ] Full verification + real-repo smoke: with enforce on, make a dependency-adding scratch edit, observe Stop block, write a valid receipt, observe release; then breaker path.

## Verification boundary

`bun test` (full, against the 2453-pass baseline), targeted minimal-change/stop-handler/mutation-observed suites, `bash scripts/check-task-sync.sh`, `bun src/cli/index.ts init --repo . --dry-run`, and the live smoke above. Gatekeeper acceptance before ship.

## Rollback surface

Single commit revert; or per-repo disable by setting `minimal_change.mode` back to `'advice'` (one value) which restores v1 behavior exactly.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Type + normalize: enforce accepted, blocking computed; update/extend `tests/minimal-change-policy.test.ts` (the "enforce normalized to advice" assertions must flip to the new contract, fail-closed on unknown modes unchanged).
- [x] Stop gate: block/release/receipt-mismatch/breaker-trip paths in `stop-handler.ts` + tests (including regression: `mode: 'advice'` stays non-blocking end to end).
- [x] Receipt reader: strict validation, malformed receipt = no release (fail closed), tests.
- [x] Circuit breaker binding + tests.
- [x] Policy flip in this repo + docs; manifests carry no minimal-change layer beyond the unchanged doc path and the retired legacy `.ai/hooks/lib/minimal-change.sh` cleanup fingerprints, so no manifest edit was required.
- [x] Full verification + real-repo smoke: with enforce on, make a dependency-adding scratch edit, observe Stop block, write a valid receipt, observe release; then breaker path.
