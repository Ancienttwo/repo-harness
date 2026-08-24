# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: 2026-08-25T03:27:48+0800 -->
<!-- stale_after: 24h -->

> **Status**: Active
> **Updated At**: 2026-08-25T03:27:48+0800
> **Source Branch**: codex/me0b-engineer-principal-claim-actor-landing
> **Source Commit**: e13bb3fd
> **Target Branch**: main
> **Stale After**: 24h
> **Reason**: merge-landing
> **Derived From**: active-plan, active-sprint, workstreams, handoff, checks, git status

This file is a tracked mainline snapshot derived from repo artifacts. It is not a live lock, not a kanban board, and not an implementation gate. If it is stale, read the source artifacts below.

## Current Focus

- Status: Active
- Active Plan: (none)
- Plan Status: (none)
- Next Task: inspect active worktree marker(s)
- Clear Note: (none)

## Mainline Snapshot Reading

- Current worktree: `tasks/current.md`
- Target branch snapshot: `git show main:tasks/current.md`
- Rule: non-target worktrees may read the target branch snapshot, but must verify against source artifacts before acting.

## Active Work

- /Users/ancienttwo/Projects/repo-harness-wt-release-0-17-0: plans/plan-20260823-2134-release-0-17-0.md
- /Users/ancienttwo/Projects/repo-harness-wt-release-0-17-0: active-worktree owner -> /Users/ancienttwo/Projects/repo-harness-wt-release-0-17-0
## Active Sprint

- Sprint: (none)
## Workstreams

- `tasks/workstreams/runtime-harness/engineer-bindings/me0a-profile-binding.md`: status=completed, current_slice=completed-20260824-me0a-profile-binding, source_plan=`plans/plan-20260824-2126-me0a-engineer-profile-binding.md`
- `tasks/workstreams/runtime-harness/engineer-bindings/me0b-principal-claim-actor.md`: status=completed, current_slice=completed-20260825-me0b-principal-claim-actor, source_plan=`plans/plan-20260825-0029-me0b-engineer-principal-claim-actor.md`
- `tasks/workstreams/runtime-harness/hook-adapters/github-issues-158-159.md`: status=completed, current_slice=completed-20260805-contract-scoped-check-repair, source_plan=plans/plan-20260805-0001-github-issues-158-159.md
- `tasks/workstreams/verification/evals-checks/github-issues-158-159.md`: status=completed, current_slice=completed-20260805-deployed-emitter-binding, source_plan=plans/plan-20260805-0001-github-issues-158-159.md
- `tasks/workstreams/verification/evals-checks/verify-sprint-incremental-retry.md`: status=active, current_slice=verify-exact-subject-retry, source_plan=plans/plan-20260824-2214-verify-sprint-incremental-retry.md
- `tasks/workstreams/workflow-engine/contract-assets/20260712-contract-assets.md`: status=completed, current_slice=completed-20260712-repo-owned-agent-fleet, source_plan=`plans/archive/plan-20260712-2053-repo-owned-agent-fleet.md`
- `tasks/workstreams/workflow-engine/contract-assets/20260714-merge-gate-enforcement.md`: status=completed, current_slice=completed-20260715-merge-gate-enforcement, source_plan=`plans/archive/plan-20260714-1713-merge-gate-enforcement.md`
- `tasks/workstreams/workflow-engine/contract-assets/agent-fleet-specialists.md`: status=completed, current_slice=completed-20260713-specialist-roles, source_plan=`plans/archive/plan-20260712-2215-agent-fleet-specialists.md`
## Handoff

- Exact Next Step: (none)

## Checks

- status=(none), source=(none), file=.ai/harness/checks/latest.json

## Git Status

- Summary: 51 changed/untracked path(s)

```
M  .archcontext/model/flows/flow.engineer-bindings.primary.yaml
A  .archcontext/model/flows/flow.mcp-sidecar.engineer-acquire.yaml
M  .archcontext/model/nodes/capability.runtime-harness.engineer-bindings.yaml
M  .archcontext/model/nodes/capability.runtime-harness.mcp-sidecar.yaml
A  .archcontext/model/relations/relation.mcp-sidecar.engineer-principal.yaml
M  AGENTS.md
M  CLAUDE.md
MM docs/architecture/.projection-manifest.json
M  docs/architecture/changelog.md
M  docs/architecture/decisions/index.md
M  docs/architecture/diagrams/architecture.likec4
M  docs/architecture/diagrams/architecture.mmd
M  docs/architecture/diagrams/architecture.structurizr.json
M  docs/architecture/index.md
M  docs/architecture/modules/runtime-harness/engineer-bindings.md
M  docs/architecture/modules/runtime-harness/mcp-sidecar.md
A  docs/architecture/requests/archive/2026/runtime-harness-mcp-sidecar.md
R  plans/plan-20260825-0029-me0b-engineer-principal-claim-actor.md -> plans/archive/plan-20260825-0029-me0b-engineer-principal-claim-actor.md
M  src/cli/commands/engineer.ts
M  src/cli/commands/mcp.ts
M  src/cli/mcp/auth.ts
A  src/cli/mcp/engineer-tools.ts
M  src/cli/mcp/instructions.ts
M  src/cli/mcp/oauth.ts
M  src/cli/mcp/policy.ts
M  src/cli/mcp/server.ts
M  src/cli/mcp/setup.ts
M  src/cli/mcp/tools.ts
M  src/cli/mcp/transports/http.ts
M  src/cli/mcp/transports/stdio.ts
M  src/cli/mcp/types.ts
A  src/core/engineers/principal-claim.ts
A  src/effects/engineers/acquire.ts
A  src/effects/engineers/claim-actor-store.ts
A  src/effects/engineers/principal-store.ts
A  src/effects/engineers/principal.ts
A  tasks/archive/contract-20260825-0316-me0b-engineer-principal-claim-actor.md
A  tasks/archive/notes-20260825-0316-me0b-engineer-principal-claim-actor.md
A  tasks/archive/review-20260825-0316-me0b-engineer-principal-claim-actor.md
A  tasks/archive/todo-20260825-0316-me0b-engineer-principal-claim-actor.md
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
