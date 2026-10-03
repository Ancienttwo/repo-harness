# Plan: Normalize --repo to a canonical repository root across campaign, refactor, and automation

> **Status**: Executing
> **Created**: 20260910-0309
> **Slug**: repo-root-normalization
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: Relative, absolute and symlinked repo root equivalence proven by a focused regression plus campaign/refactor/automation focused suites and repository-integrity checks
> **Rollback Surface**: Single-commit revert of the canonicalRepoPath routing in three CLI command modules plus the canonicalRepoPath export in src/effects/repo-registry.ts, and its regression test
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260910-0309-repo-root-normalization.contract.md`
> **Task Review**: `tasks/reviews/20260910-0309-repo-root-normalization.review.md`
> **Implementation Notes**: `tasks/notes/20260910-0309-repo-root-normalization.notes.md`

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

- Active plan: `plans/plan-20260910-0309-repo-root-normalization.md`
- Sprint contract: `tasks/contracts/20260910-0309-repo-root-normalization.contract.md`
- Sprint review: `tasks/reviews/20260910-0309-repo-root-normalization.review.md`
- Implementation notes: `tasks/notes/20260910-0309-repo-root-normalization.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260910-0309-repo-root-normalization.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260910-0309-repo-root-normalization.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260910-0309-repo-root-normalization.md`.

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
- Contract file: `tasks/contracts/20260910-0309-repo-root-normalization.contract.md`
- Review file: `tasks/reviews/20260910-0309-repo-root-normalization.review.md`
- Implementation notes file: `tasks/notes/20260910-0309-repo-root-normalization.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260910-0309-repo-root-normalization.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260910-0309-repo-root-normalization.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Single-commit revert of the resolve() wrapping in three CLI command modules and its regression test
- **Verification boundary**: Relative-vs-absolute repo root equivalence proven by a focused regression plus campaign/refactor/automation focused suites and repository-integrity checks
- **Review/acceptance boundary**: `tasks/reviews/20260910-0309-repo-root-normalization.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260910-0309-repo-root-normalization.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260910-0309-repo-root-normalization.contract.md`, `tasks/reviews/20260910-0309-repo-root-normalization.review.md`, and `tasks/notes/20260910-0309-repo-root-normalization.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260910-0309-repo-root-normalization.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Single-commit revert of the resolve() wrapping in three CLI command modules and its regression test

## Captured Planning Output

# Normalize `--repo` to an absolute path across campaign, refactor, and automation

## P1 Map

Three CLI command modules accept `--repo <path>` with a `'.'` default and pass
the raw value into effects:

- `src/cli/commands/campaign.ts` — 9 unresolved sites
- `src/cli/commands/refactor.ts` — 13 unresolved sites
- `src/cli/commands/automation.ts` — 5 unresolved sites

Every one spells the same expression, `raw.repo?.trim() || process.cwd()`.
Seventeen sibling call sites in the same files already wrap that expression in
`resolve()` (for example `campaign.ts:161` `prepare-resume`, `:205` preflight,
`:260` `close-not-planned`, `:314` `observe-revision`, `:328` `audit`), so the
absolute-root convention is already the majority spelling; the 27 sites are the
gap in it.

## P2 Trace

Observed failure, recorded in `.ai/harness/handoff/brc1415-codex-relay-result-20260909.md`:

> Relative `--repo .` produced false stale at planning boundary; absolute repo
> path passed. No product path normalization fix included.

`campaign step` (`campaign.ts:215`) binds `root` without `resolve`, then hands it
to `runCampaignPlanningStep` (`:227`) and `runCampaignAcquisition` (`:221`).
Inside planning, `campaign-planning.ts:85` records
`protection_sha256: planningProtectionDigest(root, authority.target)` on the job
and `:88` re-derives it to compare. `planningProtectionDigest` reaches
`matchCapabilityPath(registry, path, { repoRoot: root })`
(`campaign-planning-proof.ts:86`), so the root's spelling participates in
capability-ownership resolution. A `.` root and an absolute root are not the
same input, and the mismatch surfaces as
`CampaignPlanningError('source_stale', 'planning protection snapshot changed')`
— a false stale, because nothing about the canonical source actually moved.

The same shape is latent in `refactor` and `automation`: those paths reach
`readRefactorProgramStatus`, `materializeRefactorProgram`,
`readAutomationBudgetStatus` and friends with an unnormalized root. No failure
has been observed there, so they are treated as the same class rather than as
separately proven bugs.

## P3 Decision

Wrap each of the 27 sites in `resolve()`, matching the existing spelling at
`campaign.ts:161` exactly. Rejected alternative: extract a shared
`resolveRepoRoot` helper. It would become a fourth spelling competing with the
17 sites that already inline `resolve()`, and the invariant being protected —
"a repository root reaching an effect is absolute" — is one call, not a policy
that needs its own module. The abstraction would add a hop without removing an
authority.

Not in scope: changing `matchCapabilityPath` to normalize defensively. The
caller owning an absolute root is the single fix; making the callee tolerant of
both spellings would add a compatibility path that hides the next caller's bug.

## Task Breakdown

- [ ] Add a failing regression test proving `campaign step` treats a relative
      and an absolute `--repo` as the same root
- [ ] Export `canonicalRepoPath` from `src/effects/repo-registry.ts`
- [ ] Route the 13 `campaign.ts` `--repo`-derived roots through `canonicalRepoPath`
- [ ] Route the 13 `refactor.ts` `--repo`-derived roots through `canonicalRepoPath`
- [ ] Route the 5 `automation.ts` `--repo`-derived roots through `canonicalRepoPath`
- [ ] Run focused campaign/refactor/automation tests plus repository-integrity
      checks

## Verification

- New regression test, red before the fix and green after
- `bun test tests/cli/campaign-planning.test.ts tests/cli/development-campaign.test.ts tests/cli/automation-controller.test.ts tests/effects/campaign-planning.test.ts tests/effects/campaign-acquisition.test.ts --timeout 60000`
- `bun run check:type`
- `bash scripts/check-task-workflow.sh --strict`
- `bash scripts/check-architecture-sync.sh`

## Risks

- A stored digest computed under a relative root will not match one recomputed
  under the absolute root. That is the bug being fixed, not a regression, but it
  means an in-flight campaign whose job was recorded with a relative root sees a
  different digest after this change. No such job is known to exist; the
  observed case failed rather than persisting.
- The BRC14/BRC15 campaign active at the time of this fix pins a frozen
  container image to an exact packaged source. Changing `campaign.ts` breaks
  that source-equivalence proof and requires a fresh image binding before that
  campaign's next live invocation. The owner accepted this cost explicitly.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Add a failing regression test proving `campaign step` treats a relative
- [ ] Export `canonicalRepoPath` from `src/effects/repo-registry.ts`
- [ ] Route the 13 `campaign.ts` `--repo`-derived roots through `canonicalRepoPath`
- [ ] Route the 13 `refactor.ts` `--repo`-derived roots through `canonicalRepoPath`
- [ ] Route the 5 `automation.ts` `--repo`-derived roots through `canonicalRepoPath`
- [ ] Run focused campaign/refactor/automation tests plus repository-integrity
