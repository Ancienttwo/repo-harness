# Plan: Share the historical campaign fixture by template clone

> **Status**: Executing
> **Created**: 20260912-1948
> **Slug**: fixture-template
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260912-1948-fixture-template.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260912-1948-fixture-template.md`; after execution revert branch `codex/fixture-template` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260912-1948-fixture-template.contract.md`
> **Task Review**: `tasks/reviews/20260912-1948-fixture-template.review.md`
> **Implementation Notes**: `tasks/notes/20260912-1948-fixture-template.notes.md`

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

- Active plan: `plans/plan-20260912-1948-fixture-template.md`
- Sprint contract: `tasks/contracts/20260912-1948-fixture-template.contract.md`
- Sprint review: `tasks/reviews/20260912-1948-fixture-template.review.md`
- Implementation notes: `tasks/notes/20260912-1948-fixture-template.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260912-1948-fixture-template.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260912-1948-fixture-template.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260912-1948-fixture-template.md`.

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
- Contract file: `tasks/contracts/20260912-1948-fixture-template.contract.md`
- Review file: `tasks/reviews/20260912-1948-fixture-template.review.md`
- Implementation notes file: `tasks/notes/20260912-1948-fixture-template.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260912-1948-fixture-template.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260912-1948-fixture-template.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260912-1948-fixture-template.md`; after execution revert branch `codex/fixture-template` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260912-1948-fixture-template.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260912-1948-fixture-template.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260912-1948-fixture-template.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260912-1948-fixture-template.contract.md`, `tasks/reviews/20260912-1948-fixture-template.review.md`, and `tasks/notes/20260912-1948-fixture-template.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260912-1948-fixture-template.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260912-1948-fixture-template.md`; after execution revert branch `codex/fixture-template` or the explicitly reviewed diff.

## Captured Planning Output

## Goal

Four campaign-lifecycle suites rebuild the same expensive repository fixture once per
test. Build each distinct fixture once per file and give every later test a pristine
materialization of it, without weakening per-test isolation and without changing a
single assertion or test title.

## P1 Map

- `tests/helpers/historical-campaign-lifecycle.ts#historicalPlanningFixture` builds a
  disposable repository plus a disposable `REPO_HARNESS_HOME`, through
  `tests/helpers/campaign-adoption-repository.ts#createAdoptionRepository`: two
  `mkdtemp` roots, `git init`, several `git add`/`git commit` rounds, an Issue-batch
  adoption and publication, and two planning admissions with a real contract preflight.
- Consumers: `tests/effects/campaign-closeout.test.ts`,
  `tests/effects/brc10-lifecycle.test.ts`, `tests/effects/campaign-worker.test.ts`.
  `tests/effects/campaign-authoring-resume.test.ts` builds the sibling shape directly
  from `createAdoptionRepository` plus `adoptIssueBatch` and a verified revision
  observation.
- `tests/helpers/repo-fixture.ts` already owns disposable repository workspaces after
  the previous slice, so it is the one place a shared-template mechanism belongs.

## P2 Trace

A fixture is not path-independent. `src/effects/repo-registry.ts#repoHarnessRepoIdFor`
hashes the repository root path verbatim, and that id is sealed into the program
authorization, the campaign intent, the registry entry in `registered-repos.json`, the
work envelope and the publication receipt. `readRegisteredRepos` fails closed when a
stored id does not re-derive from the canonical path. A template copied to a *new*
directory would therefore be rejected by the first authority read.

## P3 Decision

Restore the template into the fixture's original `root` and `home` instead of copying
it to a fresh path. Each test still receives unshared bytes — the previous test's tree
is removed and rewritten from the pristine snapshot — so isolation is identical to a
rebuild, while every sealed path-bound digest stays valid. The snapshot is taken
immediately after the builder returns, before any test mutates it, and is keyed by the
builder's argument list so variants stay separate.

Rejected alternatives:

- Copy to a fresh path and rewrite absolute paths: impossible, the paths are inside
  sha256-sealed records.
- Classify read-only tests and share one fixture among them: needs a per-test audit that
  rots on the next edit, and it is only necessary when in-place restore does not work.

Trade-off: the restore is one directory copy per test instead of a rebuild, and the
fixture's recorded timestamps are those of the template build rather than of the test.
No consumer asserts on fixture build time. At 10x more tests per file the copy cost
grows linearly while the rebuild cost it replaces grows linearly too, so the ratio holds.

## Scope

- `tests/helpers/repo-fixture.ts`: add `tmpWorkspaceIn` and `fixtureTemplate`.
- `tests/effects/campaign-closeout.test.ts`, `tests/effects/brc10-lifecycle.test.ts`,
  `tests/effects/campaign-worker.test.ts`, `tests/effects/campaign-authoring-resume.test.ts`:
  route the fixture builders through the template and dispose the templates in `afterAll`.
- Out of scope: `src/`, `scripts/`, `.github/`, every assertion and test title, and
  `tests/helpers/collaboration-delegation-fixture.ts`.

## Promotion Gate

- **Merge/PR unit**: one PR that changes only test helpers and test plumbing.
- **Rollback surface**: revert the commit; no product code is touched.
- **Verification boundary**: the four affected suites, each in isolation and all four in
  one process, compared test-title by test-title against the pre-change baseline.
- **Review/acceptance boundary**: zero test loss and unchanged assertions are the
  acceptance condition, not the timing win.
- **High-risk surface**: cross-test leakage through a shared fixture directory.
- **Why not checklist row**: it changes shared test-fixture ownership and needs its own
  before/after evidence run, which is an independent verification boundary.

## Verification

- `bun test --timeout 180000 <file>` for each of the four files.
- `bun test --timeout 180000 <all four files>` in one process.
- `bun test --reporter=junit` before and after, with the `testcase name` multisets diffed.
- `bun run check:type`, `bun run check:hooks`, `bun run check:helpers`,
  `bun run check:reference-configs`, `bash scripts/check-architecture-sync.sh`,
  `bash scripts/check-task-workflow.sh --strict`, `bash scripts/check-task-sync.sh`,
  `bun src/cli/index.ts init --repo . --dry-run`.
- No full suite: the change touches four test files and one test helper, every consumer
  of that helper is named above, and each is run directly.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Execute captured plan: Share the historical campaign fixture by template clone
