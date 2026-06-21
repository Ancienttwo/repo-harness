# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: 2026-06-22T04:15:17+0800 -->
<!-- stale_after: 24h -->

> **Status**: Idle
> **Updated At**: 2026-06-22T04:15:17+0800
> **Source Branch**: codex/minimal-change-hooks
> **Source Commit**: 3aa1dbb
> **Target Branch**: main
> **Stale After**: 24h
> **Reason**: pr15-review-fixes
> **Derived From**: active-plan, active-sprint, workstreams, handoff, checks, git status

This file is a tracked mainline snapshot derived from repo artifacts. It is not a live lock, not a kanban board, and not an implementation gate. If it is stale, read the source artifacts below.

## Current Focus

- Status: Idle
- Active Plan: (none)
- Plan Status: (none)
- Next Task: (none)
- Clear Note: (none)

## Mainline Snapshot Reading

- Current worktree: `tasks/current.md`
- Target branch snapshot: `git show main:tasks/current.md`
- Rule: non-target worktrees may read the target branch snapshot, but must verify against source artifacts before acting.

## Active Work

- (none)
## Active Sprint

- Sprint: (none)
## Workstreams

- `tasks/workstreams/workflow-engine/contract-assets/cleanup-script-policy.md`: status=completed, current_slice=todo-01, source_plan=(none)
## Handoff

- Exact Next Step: Clean up merged contract worktree codex/main-p1-review-fixes. Command: bash scripts/contract-worktree.sh cleanup --slug main-p1-review-fixes --target main

## Checks

- status=(none), source=(none), exit_code=(none), file=.ai/harness/checks/latest.json

## Git Status

- Summary: 98 changed/untracked path(s)

```
A  .ai/harness/handoff/mcp-reader-external-gates-blocker.md
A  .ai/harness/handoff/mcp-reader-local-http-e2e.md
A  .ai/harness/handoff/mcp-reader-review-prep.md
A  .ai/harness/handoff/mcp-reader-review-request.md
A  .ai/harness/handoff/mcp-reader-self-review.md
A  .ai/harness/handoff/mcp-reader-sprint-closeout.md
M  .ai/harness/policy.json
M  .ai/hooks/lib/minimal-change.sh
M  .ai/hooks/minimal-change-observer.sh
M  .ai/hooks/prompt-guard.sh
M  .ai/hooks/stop-orchestrator.sh
M  .github/workflows/ci.yml
M  README.es.md
M  README.fr.md
M  README.ja.md
M  README.md
M  README.zh-CN.md
M  assets/hooks/lib/minimal-change.sh
M  assets/hooks/minimal-change-observer.sh
M  assets/hooks/prompt-guard.sh
M  assets/hooks/stop-orchestrator.sh
M  assets/reference-configs/minimal-change-hooks.md
M  assets/skill-version.json
A  deploy/release-checklists/260621-repo-harness-0.7.5.md
M  docs/CHANGELOG.md
M  docs/reference-configs/minimal-change-hooks.md
M  docs/repo-harness-chatgpt-mcp-setup.md
M  docs/researches/20260616-harness-engineering-frameworks.md
M  package.json
M  plans/archive/plan-20260616-HE-09-dogfood-closeout.md
M  plans/plan-20260616-HE-01-harness-research-baseline.md
M  plans/plan-20260616-HE-02-filing-terminology-normalization.md
M  plans/plan-20260616-HE-03-human-review-card.md
M  plans/plan-20260616-HE-04-contract-profiles.md
M  plans/plan-20260616-HE-05-trace-eval-schema.md
M  plans/plan-20260616-HE-06-handoff-current-ux.md
M  plans/plan-20260616-HE-07-delegation-kappa-v2.md
M  plans/plan-20260616-HE-08-spec-onboarding-compression.md
A  plans/prds/20260621-repo-harness-mcp-reader-hardening-prd.md
R  "plans/sprints/20260617-Sprint: Harness Engineering Optimization \342\200\224 State, Review, Eval, Delegation.md" -> plans/sprints/20260617-harness-engineering-optimization-state-review-eval-delegation.md
```

## Source Artifacts

- Plans: `plans/plan-*.md`
- Active marker: `.ai/harness/active-plan`
- Active worktree marker: `.ai/harness/active-worktree`
- PRDs: `plans/prds/*.prd.md`
- Sprints: `plans/sprints/*.sprint.md`
- Active sprint marker: `.ai/harness/sprint/active-sprint`
- Workstreams: `tasks/workstreams/**/*.md`
- Handoff: `.ai/harness/handoff/current.md`
- Checks: `.ai/harness/checks/latest.json`
