# Plan: Bun 1.4 upgrade take 2: hook-stdin EPIPE tolerance + toolchain bump

> **Status**: Archived
> **Created**: 20260821-0303
> **Slug**: bun-14-upgrade-take2
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Linux-side test pass is a hard pre-merge gate; macOS full suite; post-merge CI green on bun 1.4.0
> **Rollback Surface**: Single revert restores 1.3.14 pins, lockfile, and strict EPIPE propagation; prior revert ead6b216 is the template
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260821-0303-bun-14-upgrade-take2.contract.md`
> **Task Review**: `tasks/reviews/20260821-0303-bun-14-upgrade-take2.review.md`
> **Implementation Notes**: `tasks/notes/20260821-0303-bun-14-upgrade-take2.notes.md`

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

- Active plan: `plans/plan-20260821-0303-bun-14-upgrade-take2.md`
- Sprint contract: `tasks/contracts/20260821-0303-bun-14-upgrade-take2.contract.md`
- Sprint review: `tasks/reviews/20260821-0303-bun-14-upgrade-take2.review.md`
- Implementation notes: `tasks/notes/20260821-0303-bun-14-upgrade-take2.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260821-0303-bun-14-upgrade-take2.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260821-0303-bun-14-upgrade-take2.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260821-0303-bun-14-upgrade-take2.md`.

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
- Contract file: `tasks/contracts/20260821-0303-bun-14-upgrade-take2.contract.md`
- Review file: `tasks/reviews/20260821-0303-bun-14-upgrade-take2.review.md`
- Implementation notes file: `tasks/notes/20260821-0303-bun-14-upgrade-take2.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260821-0303-bun-14-upgrade-take2.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260821-0303-bun-14-upgrade-take2.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Single revert restores 1.3.14 pins, lockfile, and strict EPIPE propagation; prior revert ead6b216 is the template
- **Verification boundary**: Linux-side test pass is a hard pre-merge gate; macOS full suite; post-merge CI green on bun 1.4.0
- **Review/acceptance boundary**: `tasks/reviews/20260821-0303-bun-14-upgrade-take2.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260821-0303-bun-14-upgrade-take2.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260821-0303-bun-14-upgrade-take2.contract.md`, `tasks/reviews/20260821-0303-bun-14-upgrade-take2.review.md`, and `tasks/notes/20260821-0303-bun-14-upgrade-take2.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260821-0303-bun-14-upgrade-take2.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Single revert restores 1.3.14 pins, lockfile, and strict EPIPE propagation; prior revert ead6b216 is the template

## Captured Planning Output

# Bun 1.4 upgrade, take 2: tolerate hook-stdin EPIPE and land the toolchain bump

## Goal

Two Bun-1.4 regressions fixed, then the upgrade re-landed: (1) `executeHookScript` tolerates EPIPE on the child-stdin context write — a hook script that exits without consuming stdin is a legal hook, so `code === 'EPIPE'` on that stream is swallowed while every other stream error still propagates and the hook outcome stays determined by exit code; (2) the benchmark drift-carrier test injects mode drift explicitly via `chmodSync` instead of relying on bun-1.3's removed chmod side effect. Then: CI pins 1.3.14 → 1.4.0 (ci.yml two sites), `bun update` dependency refresh (same moves as the reverted `b6dee923`), pinned closure deps (archctx 0.4.4, archctx-contracts 0.4.4, codegraph 1.5.0) unmoved. Exit criteria REQUIRE a Linux-side verification pass before main push — macOS full suite is blind to the EPIPE regression (proven: local 2757-green, CI red at run 32404506563).

## Why

First attempt `b6dee923` was reverted (`ead6b216`, main green) after CI exposed the Linux-only EPIPE failure in `tests/skill-hooks.test.ts` ("executeHookScript runs a successful script": script exits 0, writer teardown throws EPIPE unhandled under Bun 1.4 on Linux). Design ruling (orchestrator, hook-semantics owner): the hook contract OFFERS context via stdin; consumption is optional; EPIPE on that offer is expected behavior, not a communication failure — swallowing exactly EPIPE (not other errors) is the correct fail-closed boundary. Real hook failures still surface via non-zero exit and non-EPIPE stream errors.

## Frozen decisions

1. EPIPE tolerance is scoped to the child-stdin write path in the hook executor (the function under test in `tests/skill-hooks.test.ts` "Hook Execution"): attach an error listener on the stdin stream (or wrap the write/end) that ignores errors with `code === 'EPIPE'` only; any other code rethrows/propagates as today. No broad try/catch around the spawn; no change to exit-code semantics or hook output handling.
2. Regression coverage for the EPIPE lane: a test where the hook script closes stdin immediately (e.g. `exec 0<&-` or a script that never reads and exits fast) and the executor still reports success on exit 0 — must pass on macOS AND Linux.
3. Benchmark drift-carrier fix identical to the approved-and-reverted version (`b6dee923`): explicit `chmodSync(path, 0o777)` injection after install, keep the `toEqual([0o777, 0o777])` injected-state guard, comment naming the Bun-1.4 coupling.
4. Toolchain/dep changes identical in scope to `b6dee923`: ci.yml bun-version 1.4.0 (×2), `bun update` within ranges (no majors), closure pins verified unmoved. Cherry-pick or re-apply from the revert — worker's choice, result must diff-match the intent, not necessarily the bytes.
5. Linux verification is a hard exit criterion BEFORE pushing main: preferred `docker run --rm -v <worktree>:/repo oven/bun:1.4.0 (or 1.4 tag)` running at minimum `bun test tests/skill-hooks.test.ts tests/harness-benchmark-matrix.test.ts --timeout 60000` plus install steps as needed; if docker is unavailable on this machine, push the branch and open a DRAFT PR to trigger CI (check ci.yml pull_request trigger first) and wait for the Linux jobs; only after Linux green does main get the merge/push.
6. lessons.md gains two entries (re-adding the reverted one): explicit drift injection over toolchain side effects; toolchain-upgrade contracts must include a Linux verification surface in exit criteria.

## Out of scope

- Any other hook-execution semantics; `src/cli/hook/stop-handler.ts` (a parallel work-package owns it); branch-protection/push-then-CI ordering; `scripts/check-ci.sh` local-red issue (separate finding); bun engines floor changes; dependency majors.

## Task Breakdown

- [x] Slice 1 — EPIPE fix + regression test: locate the hook executor under test in `tests/skill-hooks.test.ts`, apply frozen decision 1, add the close-stdin-immediately regression test. Verify: `bun test tests/skill-hooks.test.ts --timeout 60000` green on macOS.
- [x] Slice 2 — re-apply `b6dee923` content per frozen decisions 3-4 (test fix, ci.yml pins, package.json, bun.lock; verify closure pins unmoved). Verify: `bun test tests/harness-benchmark-matrix.test.ts --timeout 60000`; `bun run check:type`.
- [x] Slice 3 — full macOS suite (`nohup bun test --timeout 60000 > /tmp/bun14-redo-fulltest.log 2>&1; echo EXIT=$?`) expect 0 fail; `bun src/cli/index.ts init --repo . --dry-run`; `bash scripts/check-task-sync.sh` (lessons entries per frozen decision 6).
- [x] Slice 4 — Linux verification per frozen decision 5 (docker preferred; draft-PR CI fallback). HARD GATE: no main merge before Linux green.
- [ ] Slice 5 — land on main (through the contract worktree finish flow), confirm post-merge main CI green on bun 1.4.0.

## Exit Criteria

1. `tests/skill-hooks.test.ts` green on macOS and Linux under Bun 1.4, including the new EPIPE regression test.
2. `tests/harness-benchmark-matrix.test.ts` green under Bun 1.4 with the explicit drift carrier.
3. Full suite 0 fail on macOS; targeted Linux run green BEFORE main push; post-merge main CI green with bun-version 1.4.0.
4. archctx/archctx-contracts/codegraph pins unmoved (0.4.4/0.4.4/1.5.0).
5. EPIPE tolerance is provably scoped: a hook stream error with a non-EPIPE code still fails the hook (covered by test or existing coverage — name it).

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Slice 1 — EPIPE fix + regression test: locate the hook executor under test in `tests/skill-hooks.test.ts`, apply frozen decision 1, add the close-stdin-immediately regression test. Verify: `bun test tests/skill-hooks.test.ts --timeout 60000` green on macOS.
- [x] Slice 2 — re-apply `b6dee923` content per frozen decisions 3-4 (test fix, ci.yml pins, package.json, bun.lock; verify closure pins unmoved). Verify: `bun test tests/harness-benchmark-matrix.test.ts --timeout 60000`; `bun run check:type`.
- [x] Slice 3 — full macOS suite (`nohup bun test --timeout 60000 > /tmp/bun14-redo-fulltest.log 2>&1; echo EXIT=$?`) expect 0 fail; `bun src/cli/index.ts init --repo . --dry-run`; `bash scripts/check-task-sync.sh` (lessons entries per frozen decision 6).
- [x] Slice 4 — Linux verification per frozen decision 5 (docker preferred; draft-PR CI fallback). HARD GATE: no main merge before Linux green.
- [ ] Slice 5 — land on main (through the contract worktree finish flow), confirm post-merge main CI green on bun 1.4.0.
