# Plan: MCP Rollout Cutover v1

> **Status**: Archived
> **Created**: 20260711-1401
> **Slug**: mcp-rollout-cutover-v1
> **Planning Source**: waza-think
> **Orchestration Kind**: mcp-breaking-cutover
> **Source Ref**: plans/archive/plan-20260711-0139-code-authority-foundation-v1.md#B1
> **Artifact Level**: work-package
> **Promotion Reason**: rollback_boundary
> **Verification Boundary**: MCP policy, tool discovery/dispatch, local config, and documentation cut over together; focused MCP tests plus repository required checks prove the breaking public contract.
> **Rollback Surface**: Revert the reviewed branch commit; no registry, database, or hosted configuration mutation is in scope.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260711-1401-mcp-rollout-cutover-v1.contract.md`
> **Task Review**: `tasks/reviews/20260711-1401-mcp-rollout-cutover-v1.review.md`
> **Implementation Notes**: `tasks/notes/20260711-1401-mcp-rollout-cutover-v1.notes.md`

## Agentic Routing
- Selected route: single bounded breaking MCP work-package with workflow evidence and independent review
- Routing reason: Captured from waza-think planning output.
- Source ref: plans/archive/plan-20260711-0139-code-authority-foundation-v1.md#B1
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260711-1401-mcp-rollout-cutover-v1.md`
- Sprint contract: `tasks/contracts/20260711-1401-mcp-rollout-cutover-v1.contract.md`
- Sprint review: `tasks/reviews/20260711-1401-mcp-rollout-cutover-v1.review.md`
- Implementation notes: `tasks/notes/20260711-1401-mcp-rollout-cutover-v1.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260711-1401-mcp-rollout-cutover-v1.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260711-1401-mcp-rollout-cutover-v1.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260711-1401-mcp-rollout-cutover-v1.md`.

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
- Contract file: `tasks/contracts/20260711-1401-mcp-rollout-cutover-v1.contract.md`
- Review file: `tasks/reviews/20260711-1401-mcp-rollout-cutover-v1.review.md`
- Implementation notes file: `tasks/notes/20260711-1401-mcp-rollout-cutover-v1.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260711-1401-mcp-rollout-cutover-v1.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan`, the owning worktree is written to `.ai/harness/active-worktree`, and the plan is mirrored to `.claude/.active-plan` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260711-1401-mcp-rollout-cutover-v1.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the reviewed branch commit; no registry, database, or hosted configuration mutation is in scope.
- **Verification boundary**: MCP policy, tool discovery/dispatch, local config, and documentation cut over together; focused MCP tests plus repository required checks prove the breaking public contract.
- **Review/acceptance boundary**: `tasks/reviews/20260711-1401-mcp-rollout-cutover-v1.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: rollback_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260711-1401-mcp-rollout-cutover-v1.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260711-1401-mcp-rollout-cutover-v1.contract.md`, `tasks/reviews/20260711-1401-mcp-rollout-cutover-v1.review.md`, and `tasks/notes/20260711-1401-mcp-rollout-cutover-v1.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260711-1401-mcp-rollout-cutover-v1.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the reviewed branch commit; no registry, database, or hosted configuration mutation is in scope.

## Captured Planning Output

# MCP Rollout Cutover v1 — Decision Complete Plan

## Goal

Retire the temporary general-repository rollout and rollback controls. A
workspace-reader-enabled MCP server exposes the general repository API; the
registered repository record is the only authority for repository identity and
`accessMode` is the only authority for mutations. CodeGraph remains advisory
metadata, while the guarded filesystem walker/read path remains authoritative
for visible content.

## P1: Architecture Map

- Policy assembly: `src/cli/mcp/policy.ts` builds the capability policy for all
  MCP profiles; `src/cli/mcp/types.ts` defines its contract.
- Runtime assembly: `src/cli/mcp/server.ts` loads local configuration and
  creates the tool context; `src/cli/mcp/setup.ts` writes that configuration and
  the user guide; `src/cli/mcp/auth.ts` owns its schema.
- Tool boundary: `src/cli/mcp/reader-tools.ts` publishes and dispatches the
  workspace-reader tool surface; `src/cli/mcp/general-repo-access.ts` owns
  general-repository reads, mutations, snapshots, and capability responses;
  `src/cli/mcp/tools.ts` owns workflow-specific tools.
- Safety authority: registered repositories and `accessMode` come from
  `src/effects/repo-registry.ts`; path containment, `.ignore`, and mutation
  preconditions are enforced by
  `src/cli/mcp/general-repo-access/authority.ts`.
- Consumer boundary: generated setup guidance,
  `docs/reference-configs/general-repo-mcp.md`, and
  `deploy/runbooks/general-repo-mcp-codegraph.md` describe the active contract.
  The rollout gate and its test are temporary migration evidence, not a durable
  operator surface.

## P2: Concrete Trace

`repo-harness mcp serve` resolves the repo and local configuration in
`createMcpToolContext` -> derives a profile policy ->
`buildMcpToolDefinitions` publishes tools -> `callMcpTool` delegates reader
tools -> `callGeneralRepoTool` resolves `repo_id` from the registry -> path and
ignore guards validate every target -> CodeGraph contributes index metadata and
the secure filesystem reader returns visible content. Mutations additionally
call `assertRepoWriteEnabled`, which checks only the registered
`accessMode: read_write` and revision preconditions. The current pressure point
is the six-field rollout object: it independently hides tools, denies calls,
blocks readable unindexed content, changes write authorization, and reintroduces
legacy routes. That duplicates authority and produces a divergent public
surface from the same registered repository state.

## P3: Design Decision

Remove the rollout object and all environment/config overrides in one breaking
cutover. Do not replace the flags with aliases, defaults, compatibility
parsers, or a shadow policy. General-repository reads are available whenever
the existing workspace reader capability is enabled; write execution stays
fail-closed on the registry's `accessMode`. Unindexed visible content continues
through the already guarded filesystem path, so CodeGraph availability cannot
silently become a read-authorization decision. Keep workflow-specific tools
and direct workspace tools only where they remain distinct, explicitly named
capabilities; remove the rollout-era `search_text` fallback dispatch and the
workflow-to-general-repo wrapper so a request has one route. At 10x, this avoids
per-deployment flag drift and makes registry state the single operational
authorization lookup.

## Scope and Non-Goals

In scope: delete all six general-repository rollout flags from policy, runtime,
local configuration, setup output, capability responses, docs, tests, and the
temporary rollout gate; make general tools deterministic for an enabled reader;
retain path, ignore, snapshot, and mutation guards; add regression coverage for
the new access-mode-only rule and unindexed content behavior.

Out of scope: B2 TypeScript adoption apply cutover, new MCP tools, auth/OAuth
changes, repo-registration semantics, CodeGraph indexing changes, release
publication, and historical sprint/release evidence edits.

## Implementation Design

1. Delete `McpPolicy.generalRepo`, its policy-option override, defaults, server
   environment/config parsing, and every static policy projection (including
   the ChatGPT browser file policy). Remove the obsolete `rollout.generalRepo`
   field from the local-config type and have setup rewrite a clean config without
   it. Retired local rollout data must not influence server behavior.
2. Make `buildReaderToolDefinitions` always include the general repository tool
   definitions for an enabled reader. Do not filter write tools by a process
   flag; the call still fails closed through `assertRepoWriteEnabled` for a
   `read_only` repo. Remove the workspace `search_text` fallback so that name
   has exactly the general-repository contract and requires `repo_id`.
3. Remove rollout checks from `callReaderTool` and `callGeneralRepoTool`.
   Derive `writable` and `write_tools` from registry `accessMode` alone. Remove
   the rollout response object. Permit guarded filesystem reads/search of
   visible unindexed files and state that CodeGraph is advisory in capability
   output.
4. Remove the workflow-file bridge that conditionally calls `read_file` and
   preserve the workflow tool as its own bounded, redacted route. This removes
   the hidden two-implementation fallback without deleting a distinct workflow
   capability.
5. Delete `scripts/mcp-rollout-gate.ts` and its dedicated test. Update active
   setup/reference/runbook documentation to describe the cutover contract and
   diagnostics without canary, rollback, or flag instructions. Do not rewrite
   historical sprint, review, note, or release evidence.
6. Update focused policy, reader, tools, setup, HTTP, and general-repository
   tests. Assert that tool discovery is deterministic, `read_only` mutations
   fail, `read_write` mutations are authorized by registry state, unindexed
   visible content is readable, legacy rollout fields no longer control the
   runtime, and no retired identifiers remain outside historical artifacts.

## Risk Controls

- Public MCP contract is intentionally breaking. Documentation, setup output,
  and focused tool-list/dispatch tests change in the same work-package.
- `accessMode` must remain the sole mutation gate. Reuse the existing authority
  assertion instead of adding another boolean.
- CodeGraph outage must not bypass path or ignore guards; tests cover visible
  unindexed reads and existing path/symlink safety coverage remains mandatory.
- Do not parse or honor retired environment variables. The completion scan is
  the fail-closed evidence against a shadow control path.

## Verification

- `bun test tests/cli/mcp-policy.test.ts tests/cli/mcp-reader-tools.test.ts tests/cli/mcp-tools.test.ts tests/cli/mcp-setup.test.ts tests/cli/mcp-http.test.ts`
- `bun test`
- `bash scripts/check-deploy-sql-order.sh`
- `bash scripts/check-architecture-sync.sh`
- `bash scripts/check-task-sync.sh`
- `repo-harness run check-task-workflow --strict`
- `bun scripts/inspect-project-state.ts --repo . --format text`
- `bash scripts/migrate-project-template.sh --repo . --dry-run`
- targeted retired-identifier scan over active source/docs/tests/scripts, while
  excluding immutable historical evidence.

## Task Breakdown

- [ ] B1-01 remove rollout policy/config/environment authority and make general tool discovery deterministic
- [ ] B1-02 make registry accessMode and guarded filesystem reads the only runtime access decisions
- [ ] B1-03 remove rollout-era bridge/gate and update active MCP operations documentation
- [ ] B1-04 add regression coverage, run required checks, review, and close workflow artifacts

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] B1-01 remove rollout policy/config/environment authority and make general tool discovery deterministic
- [x] B1-02 make registry accessMode and guarded filesystem reads the only runtime access decisions
- [x] B1-03 remove rollout-era bridge/gate and update active MCP operations documentation
- [x] B1-04 add regression coverage, run required checks, review, and close workflow artifacts
