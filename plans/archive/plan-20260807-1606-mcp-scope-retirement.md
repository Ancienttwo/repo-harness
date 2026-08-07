# Plan: MCP config: retire repo scope, single user-level storage authority

> **Status**: Archived
> **Created**: 20260807-1606
> **Slug**: mcp-scope-retirement
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: repo-harness-migration-review-slice-2
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: bun test, check:type, init dry-run, manual legacy-fixture migration trace
> **Rollback Surface**: single squash PR revert restores dual-scope; user-side data untouched
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260807-1606-mcp-scope-retirement.contract.md`
> **Task Review**: `tasks/reviews/20260807-1606-mcp-scope-retirement.review.md`
> **Implementation Notes**: `tasks/notes/20260807-1606-mcp-scope-retirement.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: repo-harness-migration-review-slice-2
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260807-1606-mcp-scope-retirement.md`
- Sprint contract: `tasks/contracts/20260807-1606-mcp-scope-retirement.contract.md`
- Sprint review: `tasks/reviews/20260807-1606-mcp-scope-retirement.review.md`
- Implementation notes: `tasks/notes/20260807-1606-mcp-scope-retirement.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260807-1606-mcp-scope-retirement.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260807-1606-mcp-scope-retirement.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260807-1606-mcp-scope-retirement.md`.

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
- Contract file: `tasks/contracts/20260807-1606-mcp-scope-retirement.contract.md`
- Review file: `tasks/reviews/20260807-1606-mcp-scope-retirement.review.md`
- Implementation notes file: `tasks/notes/20260807-1606-mcp-scope-retirement.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260807-1606-mcp-scope-retirement.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260807-1606-mcp-scope-retirement.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: single squash PR revert restores dual-scope; user-side data untouched
- **Verification boundary**: bun test, check:type, init dry-run, manual legacy-fixture migration trace
- **Review/acceptance boundary**: `tasks/reviews/20260807-1606-mcp-scope-retirement.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260807-1606-mcp-scope-retirement.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260807-1606-mcp-scope-retirement.contract.md`, `tasks/reviews/20260807-1606-mcp-scope-retirement.review.md`, and `tasks/notes/20260807-1606-mcp-scope-retirement.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260807-1606-mcp-scope-retirement.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: single squash PR revert restores dual-scope; user-side data untouched

## Captured Planning Output

# MCP config: retire the repo scope, single user-level storage authority (Slice 2)

## Problem

MCP config/auth storage has two scope authorities: `'repo'` (`<repo>/.repo-harness/`) and `'user'` (`~/.repo-harness/`). The repo scope is a pre-registry historical layer the code itself has disowned: the shipped guide says it is not recommended (`setup.ts` guide text) while `parseMcpConfigScope(undefined)` still defaults to it; the coding profile hard-rejects it in three places with the rationale "grants and authorization revision live in user-owned ignored state" — a rationale equally true for bearer tokens and OAuth refresh tokens; `authorizationRevision` written into repo config is stored but never validated (planner profile skips the check); and the user-level registry (`repo-registry.ts`) already owns per-repo authorization. Dual authority violates the repo's one-source-of-truth policy, and every new storage file re-opens the ignore-discipline problem Slice 1 (#164) just closed.

## Decision (approved direction from the migration review)

Retire the repo scope entirely. Single storage authority: `~/.repo-harness/` (overridable via `REPO_HARNESS_HOME`). Fail-closed migration, credential rotation not relocation.

1. **Scope removal**: `McpConfigScope` type and every branch on it disappear; `mcpStorageDir` returns the user dir only; `resolveMcpConfigScope` deleted; `--scope` CLI flags and `parseMcpConfigScope` deleted; `setup.ts` repo-scope branches (gitignore compensation `ensureGitignoreEntries` block, repo-branch auth object) deleted; guide text rewritten to the user-level shape.
2. **Fail-closed migration gate**: MCP commands (`serve`, `setup`, `doctor` surfaces that read config) detect legacy `<repo>/.repo-harness/mcp.local.json` and abort with a clear error naming `repo-harness mcp migrate-scope`. No silent read-through fallback (repo policy: no compatibility fallbacks).
3. **`repo-harness mcp migrate-scope` command** — rotation semantics:
   - Non-secret fields of legacy `mcp.local.json` (host/port/endpoint/serverName/allowedRoots/profile) merge into user config.
   - `mcp.tokens.json` (bearer) and `mcp.oauth.json` (passphrase): regenerate fresh values; never copy old ones (they lived inside a git working tree and may exist in backups/history).
   - `mcp.oauth-tokens.json`: delete outright — ChatGPT re-authorizes once.
   - Legacy repo-side files removed after migration; command prints an explicit rotated/invalidated inventory.
4. **Dead-code sweep in the same package** (it teaches the retired shape): `engine.ts:174-179` `ignoreLines` block (confirmed dead: reads `.gitignore` into a voided binding); `chatgpt-browser.tokens.json` writer-less gitignore mentions in `engine.ts:177` region if still present after Slice 1.
5. **Out of scope**: relocating `chatgpt-browser.local.json` to user level (Slice 3); registry identity rework (`repoHarnessRepoIdFor` path-hash staleness); any OAuth provider/TTL behavior change.

## Compatibility note (explicit, bounded)

The migration gate + command IS the explicit one-shot migration path required by policy; it fails closed, prints what it rotated, and the legacy path is removed in this same work-package. Existing repo-scope installs must run `mcp migrate-scope` once and re-authorize ChatGPT once. This is a breaking change: next release is 0.14.0.

## Task Breakdown

- [x] Remove `McpConfigScope` and all scope branches (`auth.ts`, `setup.ts`, `server.ts`, `transports/http.ts`, `commands/mcp.ts`, any other referrer found by type errors).
- [x] Add the fail-closed legacy-detection gate on MCP command entry.
- [x] Implement `mcp migrate-scope` with rotation semantics and inventory output.
- [x] Dead-code sweep: `engine.ts` `ignoreLines` block.
- [x] Rewrite affected tests: `tests/cli/mcp-setup.test.ts` repo-scope assertions become migration-gate assertions; delete `--scope repo` coding-rejection case; new tests for the gate (legacy present → error) and migrate-scope (rotation, deletion, inventory, idempotent re-run on already-migrated repo).
- [x] Update `docs/repo-harness-chatgpt-mcp-setup.md` and setup guide text to the user-level shape.
- [x] Full `bun test`, `bun run check:type`, `bun src/cli/index.ts init --repo . --dry-run` green.

## Verification

`bun test` (full), `bun run check:type`, `bun src/cli/index.ts init --repo . --dry-run`, plus a manual trace: legacy fixture repo → gate error → `migrate-scope` → user config present, old files gone, re-run reports nothing to migrate.

## Rollback

Single squash-merged PR; revert restores the dual-scope shape. No persisted-data format change on the user side (existing user-scope installs are untouched).

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Remove `McpConfigScope` and all scope branches (`auth.ts`, `setup.ts`, `server.ts`, `transports/http.ts`, `commands/mcp.ts`, any other referrer found by type errors).
- [x] Add the fail-closed legacy-detection gate on MCP command entry.
- [x] Implement `mcp migrate-scope` with rotation semantics and inventory output.
- [x] Dead-code sweep: `engine.ts` `ignoreLines` block.
- [x] Rewrite affected tests: `tests/cli/mcp-setup.test.ts` repo-scope assertions become migration-gate assertions; delete `--scope repo` coding-rejection case; new tests for the gate (legacy present → error) and migrate-scope (rotation, deletion, inventory, idempotent re-run on already-migrated repo).
- [x] Update `docs/repo-harness-chatgpt-mcp-setup.md` and setup guide text to the user-level shape.
- [x] Full `bun test`, `bun run check:type`, `bun src/cli/index.ts init --repo . --dry-run` green.
