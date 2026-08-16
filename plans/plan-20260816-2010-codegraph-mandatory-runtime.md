# Plan: Make CodeGraph Mandatory

> **Status**: Review
> **Created**: 20260816-2010
> **Slug**: codegraph-mandatory-runtime
> **Planning Source**: user-approved-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: worktree_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260816-2010-codegraph-mandatory-runtime.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260816-2010-codegraph-mandatory-runtime.md`; after execution revert branch `codex/codegraph-mandatory-runtime` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260816-2010-codegraph-mandatory-runtime.contract.md`
> **Task Review**: `tasks/reviews/20260816-2010-codegraph-mandatory-runtime.review.md`
> **Implementation Notes**: `tasks/notes/20260816-2010-codegraph-mandatory-runtime.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from user-approved-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260816-2010-codegraph-mandatory-runtime.md`
- Sprint contract: `tasks/contracts/20260816-2010-codegraph-mandatory-runtime.contract.md`
- Sprint review: `tasks/reviews/20260816-2010-codegraph-mandatory-runtime.review.md`
- Implementation notes: `tasks/notes/20260816-2010-codegraph-mandatory-runtime.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260816-2010-codegraph-mandatory-runtime.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260816-2010-codegraph-mandatory-runtime.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260816-2010-codegraph-mandatory-runtime.md`.

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
- Contract file: `tasks/contracts/20260816-2010-codegraph-mandatory-runtime.contract.md`
- Review file: `tasks/reviews/20260816-2010-codegraph-mandatory-runtime.review.md`
- Implementation notes file: `tasks/notes/20260816-2010-codegraph-mandatory-runtime.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260816-2010-codegraph-mandatory-runtime.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260816-2010-codegraph-mandatory-runtime.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260816-2010-codegraph-mandatory-runtime.md`; after execution revert branch `codex/codegraph-mandatory-runtime` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260816-2010-codegraph-mandatory-runtime.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260816-2010-codegraph-mandatory-runtime.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: worktree_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260816-2010-codegraph-mandatory-runtime.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260816-2010-codegraph-mandatory-runtime.contract.md`, `tasks/reviews/20260816-2010-codegraph-mandatory-runtime.review.md`, and `tasks/notes/20260816-2010-codegraph-mandatory-runtime.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260816-2010-codegraph-mandatory-runtime.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260816-2010-codegraph-mandatory-runtime.md`; after execution revert branch `codex/codegraph-mandatory-runtime` or the explicitly reviewed diff.

## Captured Planning Output

## Goal

Make CodeGraph a mandatory repo-harness runtime dependency and make every applied `repo-harness init` establish a usable repo-local CodeGraph index. The exact CodeGraph version remains `1.5.0`, because npm registry `latest` was freshly verified as `1.5.0` on 2026-08-16; the dependency promotion is from dev/optional semantics to direct production/mandatory semantics, not an invented unavailable version.

## Success Criteria

- `@colbymchenry/codegraph@1.5.0` is a direct exact production dependency and is no longer a dev-only dependency.
- `repo-harness install` and `repo-harness update` always ensure the exact compatible CodeGraph CLI and MCP configuration; public opt-out and interactive optional-dependency semantics are removed.
- Applied `repo-harness init` always attempts `codegraph init -i .` when missing and fails closed when the mandatory CLI/index cannot be established. Repo-scoped init still never writes HOME; missing global runtime routes to `repo-harness update`.
- Dry-run remains read-only. Existing initialized repos are handled idempotently.
- CLI help, generated workflow metadata, docs, templates, tests, and version projections agree on the mandatory contract.

## Scope

- Package manifest and lockfile dependency classification.
- Global runtime install/update option and execution paths.
- Repo adoption/init CodeGraph path, failure semantics, and public CLI flags.
- Focused unit/integration tests, template projections, user-facing docs, architecture/task synchronization required by touched capabilities.

## Non-Scope

- No CodeGraph source changes, fork, compatibility fallback, or version beyond npm latest.
- No MCP protocol redesign and no hosted CodeGraph service.
- No unrelated external skill, Waza, Claude adapter, or plugin-market implementation.

## P1 Architecture Map

- `package.json`/`bun.lock` own package delivery.
- `src/cli/index.ts` owns install/update/init public options and routing.
- `src/cli/commands/global-runtime.ts` owns exact-version global CodeGraph reconciliation and MCP configuration.
- `src/cli/commands/init.ts` owns repo-local adoption and index initialization.
- `src/cli/tools/codegraph.ts` owns resolution plus init/sync actions.
- `archctx-contracts` owns the exact compatible CodeGraph version projection.

## P2 Concrete Trace

`repo-harness install|update` -> global runtime transaction -> exact CodeGraph install/readback -> MCP configure. `repo-harness init --repo X` -> adoption apply -> mandatory CodeGraph readiness -> `codegraph init -i .` if uninitialized -> structured step -> workflow verification. Any missing or failed mandatory CodeGraph action makes the command exit non-zero with a focused remediation path.

## P3 Decision

Preserve CLI/runtime authority and fail closed. Remove `--no-codegraph` and the CodeGraph confirmation prompt because a hard dependency cannot simultaneously be optional. Keep repo init from mutating HOME; global installation/configuration remains `install/update`, while init owns only the target repo index. At 10x scale the first pressure is index time/size, not semantic authority; idempotent detection prevents unnecessary rebuilds.

## Task Breakdown

- [x] Add regression tests that encode mandatory install/update and init behavior, including failure and idempotency.
- [x] Promote CodeGraph to a direct production dependency and update the lockfile.
- [x] Remove optional CodeGraph flags/prompts and force global-runtime reconciliation.
- [x] Make applied init fail closed unless the index becomes ready; retain dry-run and HOME boundaries.
- [x] Synchronize generated helpers/docs/architecture/task surfaces.
- [x] Run focused tests, full required checks, dry-run, and clean fixture init.

## Evidence Contract

- State/progress: active plan, projected contract, and contract worktree metadata.
- Verification: focused CLI tests plus `bun test`, required shell gates, strict workflow check, inspector, and `bun src/cli/index.ts init --repo . --dry-run`.
- Evaluator rubric: dependency is direct production exact latest; no public opt-out remains; init creates or confirms `.codegraph`; missing/failing CodeGraph blocks completion; no HOME mutation occurs from repo init.
- Stop condition: any required check fails for this diff, npm latest cannot be verified, or clean-room init cannot establish the index.
- Rollback: revert the work-package commit; package lock, CLI semantics, templates, and docs change in one unit.

## Risks

- CodeGraph is a large platform-native package; package install size increases. This is accepted by the explicit hard-dependency request and remains one platform-specific optional binary selected by the package manager.
- Removing `--no-codegraph` is a deliberate breaking CLI change. Tests and docs must expose it rather than preserve a compatibility alias.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add regression tests that encode mandatory install/update and init behavior, including failure and idempotency.
- [x] Promote CodeGraph to a direct production dependency and update the lockfile.
- [x] Remove optional CodeGraph flags/prompts and force global-runtime reconciliation.
- [x] Make applied init fail closed unless the index becomes ready; retain dry-run and HOME boundaries.
- [x] Synchronize generated helpers/docs/architecture/task surfaces.
- [x] Run focused tests, full required checks, dry-run, and clean fixture init.
