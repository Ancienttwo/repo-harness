# Plan: Template the auto-campaign skill fixture

> **Status**: Executing
> **Created**: 20260913-0144
> **Slug**: auto-campaign-template
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260913-0144-auto-campaign-template.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260913-0144-auto-campaign-template.md`; after execution revert branch `codex/auto-campaign-template` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260913-0144-auto-campaign-template.contract.md`
> **Task Review**: `tasks/reviews/20260913-0144-auto-campaign-template.review.md`
> **Implementation Notes**: `tasks/notes/20260913-0144-auto-campaign-template.notes.md`

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

- Active plan: `plans/plan-20260913-0144-auto-campaign-template.md`
- Sprint contract: `tasks/contracts/20260913-0144-auto-campaign-template.contract.md`
- Sprint review: `tasks/reviews/20260913-0144-auto-campaign-template.review.md`
- Implementation notes: `tasks/notes/20260913-0144-auto-campaign-template.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260913-0144-auto-campaign-template.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260913-0144-auto-campaign-template.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260913-0144-auto-campaign-template.md`.

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
- Contract file: `tasks/contracts/20260913-0144-auto-campaign-template.contract.md`
- Review file: `tasks/reviews/20260913-0144-auto-campaign-template.review.md`
- Implementation notes file: `tasks/notes/20260913-0144-auto-campaign-template.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260913-0144-auto-campaign-template.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260913-0144-auto-campaign-template.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260913-0144-auto-campaign-template.md`; after execution revert branch `codex/auto-campaign-template` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260913-0144-auto-campaign-template.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260913-0144-auto-campaign-template.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260913-0144-auto-campaign-template.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260913-0144-auto-campaign-template.contract.md`, `tasks/reviews/20260913-0144-auto-campaign-template.review.md`, and `tasks/notes/20260913-0144-auto-campaign-template.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260913-0144-auto-campaign-template.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260913-0144-auto-campaign-template.md`; after execution revert branch `codex/auto-campaign-template` or the explicitly reviewed diff.

## Captured Planning Output

## Goal

Remove the repeated expensive fixture build in `tests/auto-campaign-skill.test.ts` by routing
`fixture()` through the existing `fixtureTemplate` helper in `tests/helpers/repo-fixture.ts`.

## Problem

`fixture(profile)` runs, per test:

- `git init` plus an empty `git commit` in a fresh mkdtemp repository,
- `bash scripts/sync-codex-installed-copies.sh`, which starts three Bun child processes
  (`scripts/check-managed-runtime.ts` conditionally, `skill-surface-select.ts` twice) and
  rsyncs the whole package into two skill roots.

Three tests pay that cost three times. The local baseline for the file is 81.86s
(`bun test --timeout 180000 tests/auto-campaign-skill.test.ts`); the CI per-file baseline is 44.10s.

## Approach

Wrap the existing builder in the synchronous `fixtureTemplate` overload added by PR #423,
keyed by the install profile, with `workspacePaths` selecting the single mkdtemp directory
that owns every byte the fixture writes:

- `repo` (git repository), `bin` (CLI shim), `runtime` (`REPO_HARNESS_HOME`),
  `codex-skills` and `claude-skills` (`CODEX_SKILLS_ROOT` / `CLAUDE_SKILLS_ROOT`, the only
  destinations `sync-codex-installed-copies.sh` writes to) all live under that directory,
  and `HOME` is that directory itself.

The two `full` tests then share one build; `minimal` keeps its own. `draft()` still spawns a
real `prepare-grant.ts` child process every call, because that is the behaviour under test.
Snapshot restore happens in place, so the sealed grant paths and repo id stay valid, and the
per-test `afterEach` removal keeps each test's bytes unshared.

## Task Breakdown

- [ ] Route `fixture()` in `tests/auto-campaign-skill.test.ts` through `fixtureTemplate`, register the
      directory for `afterEach` removal at the call site, and dispose templates in `afterAll`.
- [ ] Verify the file isolated and co-resident with an existing `fixtureTemplate` consumer, and prove
      the JUnit testcase-name multiset is unchanged.

## Verification

- `bun test --timeout 180000 tests/auto-campaign-skill.test.ts`
- `bun test --timeout 180000 tests/auto-campaign-skill.test.ts tests/effects/campaign-worker.test.ts`
- repository-integrity checks (`check:type`, `check:hooks`, `check:helpers`, `check:reference-configs`,
  architecture sync, task workflow, task sync, `init --repo . --dry-run`)

## Risks

No product source changes; scope is one test file. If snapshot restore ever conflicted with the
installed-copy owner markers the tests would fail closed on the ownership hash, not silently pass.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Route `fixture()` in `tests/auto-campaign-skill.test.ts` through `fixtureTemplate`, register the
- [ ] Verify the file isolated and co-resident with an existing `fixtureTemplate` consumer, and prove
