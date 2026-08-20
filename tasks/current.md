# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: 2026-08-20T16:21:12+0800 -->
<!-- stale_after: 24h -->

> **Status**: ManualClearedWithActiveWork
> **Updated At**: 2026-08-20T16:21:12+0800
> **Source Branch**: main
> **Source Commit**: aebebae1
> **Target Branch**: main
> **Stale After**: 24h
> **Reason**: archive-workflow
> **Derived From**: active-plan, active-sprint, workstreams, handoff, checks, git status

This file is a tracked mainline snapshot derived from repo artifacts. It is not a live lock, not a kanban board, and not an implementation gate. If it is stale, read the source artifacts below.

## Current Focus

- Status: ManualClearedWithActiveWork
- Active Plan: (none)
- Plan Status: (none)
- Next Task: inspect active worktree marker(s)
- Clear Note: Manual clear requested, but active work markers still exist. Idle was not written.

## Mainline Snapshot Reading

- Current worktree: `tasks/current.md`
- Target branch snapshot: `git show main:tasks/current.md`
- Rule: non-target worktrees may read the target branch snapshot, but must verify against source artifacts before acting.

## Active Work

- /private/tmp/repo-harness-wt-projection-publication-ownership: plans/plan-20260820-1605-projection-publication-ownership.md
- /private/tmp/repo-harness-wt-projection-publication-ownership: active-worktree owner -> /private/tmp/repo-harness-wt-projection-publication-ownership
## Active Sprint

- Sprint: (none)
## Workstreams

- `tasks/workstreams/runtime-harness/hook-adapters/github-issues-158-159.md`: status=completed, current_slice=completed-20260805-contract-scoped-check-repair, source_plan=plans/plan-20260805-0001-github-issues-158-159.md
- `tasks/workstreams/verification/evals-checks/github-issues-158-159.md`: status=completed, current_slice=completed-20260805-deployed-emitter-binding, source_plan=plans/plan-20260805-0001-github-issues-158-159.md
- `tasks/workstreams/workflow-engine/contract-assets/20260712-contract-assets.md`: status=completed, current_slice=completed-20260712-repo-owned-agent-fleet, source_plan=`plans/archive/plan-20260712-2053-repo-owned-agent-fleet.md`
- `tasks/workstreams/workflow-engine/contract-assets/20260714-merge-gate-enforcement.md`: status=completed, current_slice=completed-20260715-merge-gate-enforcement, source_plan=`plans/archive/plan-20260714-1713-merge-gate-enforcement.md`
- `tasks/workstreams/workflow-engine/contract-assets/agent-fleet-specialists.md`: status=completed, current_slice=completed-20260713-specialist-roles, source_plan=`plans/archive/plan-20260712-2215-agent-fleet-specialists.md`
- `tasks/workstreams/workflow-engine/contract-assets/cleanup-script-policy.md`: status=completed, current_slice=completed-20260529-cleanup-script-policy, source_plan=(none)
- `tasks/workstreams/workflow-engine/contract-assets/github-issues-158-159.md`: status=completed, current_slice=completed-20260805-packaged-helper-projection, source_plan=plans/plan-20260805-0001-github-issues-158-159.md
- `tasks/workstreams/workflow-engine/inspection-migration/20260703-inspection-migration.md`: status=completed, current_slice=completed-20260703-architecture-closeout, source_plan=(none)
## Handoff

- Exact Next Step: (none)

## Checks

- status=pass, source=verify-sprint, exit_code=0, file=.ai/harness/checks/latest.json

## Git Status

- Summary: 699 changed/untracked path(s)

```
 M docs/architecture/.projection-manifest.json
 D plans/plan-20260528-1436-hook-global-runtime.md
 D plans/plan-20260528-1443-hook-auto-archive-on-done.md
 D plans/plan-20260528-1652-codegraph-readiness.md
 D plans/plan-20260529-0004-capability-context-cli-hook.md
 D plans/plan-20260529-0909-astrozi-user-level-hook.md
 D plans/plan-20260530-1023-tracked-current-status-snapshot.md
 D plans/plan-20260530-2005-think-headroom-caveman-codegraph-cbm.md
 D plans/plan-20260531-0216-think-external-acceptance-contract-worktree-finish-sprint-verifi.md
 D plans/plan-20260606-0443-think-skill-codex-repo-skill-think-hook-agents-md.md
 D plans/plan-20260612-2351-downstream-legacy-cleanup-policy.md
 D plans/plan-20260613-0314-think-scan-init-hook.md
 D plans/plan-20260614-1838-gptpro-review-followup.md
 D plans/plan-20260616-HE-01-harness-research-baseline.md
 D plans/plan-20260616-HE-02-filing-terminology-normalization.md
 D plans/plan-20260616-HE-03-human-review-card.md
 D plans/plan-20260616-HE-04-contract-profiles.md
 D plans/plan-20260616-HE-08-spec-onboarding-compression.md
 D plans/plan-20260622-1651-pr17-review-freshness-failclosed.md
 D plans/plan-20260623-1516-plan-completeness-gate-english-guidance.md
 D plans/plan-20260705-2027-review-scope-fidelity.md
 D plans/plan-20260711-0115-think-plan-011459.md
 D plans/plan-20260711-1034-chatgpt-coding-mcp-live-canary.md
 D plans/plan-20260712-0450-bdd2-eval-foundation.md
 D plans/plan-20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.md
 D plans/plan-20260712-1330-bun-1-3-14-runtime-upgrade.md
 D plans/plan-20260714-0421-verifier-evidence-lifecycle-cutover.md
 D plans/plan-20260714-2318-repo-harness-0-10-0-release-blockers.md
 D plans/plan-20260715-1140-skill-surface-discovery-convergence.md
 D plans/plan-20260716-0150-lsc-01-profile-operation-characterization.md
 D plans/plan-20260716-0222-effective-state-test-retirement.md
 D plans/plan-20260716-0338-closeout-runner-guardrails.md
 D plans/plan-20260716-1419-closeout-authority-bootstrap.md
 D plans/plan-20260718-1405-lsc-02-artifact-requirement-policy.md
 D plans/plan-20260718-1531-lsc-03-standard-contract-semantic-cutover.md
 D plans/plan-20260718-1909-lsc-04-revision-partition-and-progress-token.md
 D plans/plan-20260718-2119-lsc-05-stable-state-version-allocation.md
 D plans/plan-20260718-2239-lsc-06-operation-readiness-evaluator.md
 D plans/plan-20260718-2350-lsc-07-stop-semantics-cutover.md
 D plans/plan-20260719-0155-lsc-08-adapter-parity-and-docs.md
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
