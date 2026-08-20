# Plan: ESA-06 guarded workflow-artifact writer: mandatory revision preconditions

> **Status**: Archived
> **Created**: 20260820-2307
> **Slug**: esa06-guarded-artifact-writer
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: 12-case MCP write-path regression suite plus full Required Checks; breaking surface proven by RETIRED_PARAMETER/UNKNOWN_PARAMETER rejection tests
> **Rollback Surface**: Single revert restores boolean overwrite semantics; released mandatory precondition must not be silently rolled back per ESA-06 spec — rollback requires an explicit compatibility release decision
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260820-2307-esa06-guarded-artifact-writer.contract.md`
> **Task Review**: `tasks/reviews/20260820-2307-esa06-guarded-artifact-writer.review.md`
> **Implementation Notes**: `tasks/notes/20260820-2307-esa06-guarded-artifact-writer.notes.md`

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

- Active plan: `plans/plan-20260820-2307-esa06-guarded-artifact-writer.md`
- Sprint contract: `tasks/contracts/20260820-2307-esa06-guarded-artifact-writer.contract.md`
- Sprint review: `tasks/reviews/20260820-2307-esa06-guarded-artifact-writer.review.md`
- Implementation notes: `tasks/notes/20260820-2307-esa06-guarded-artifact-writer.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260820-2307-esa06-guarded-artifact-writer.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260820-2307-esa06-guarded-artifact-writer.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260820-2307-esa06-guarded-artifact-writer.md`.

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
- Contract file: `tasks/contracts/20260820-2307-esa06-guarded-artifact-writer.contract.md`
- Review file: `tasks/reviews/20260820-2307-esa06-guarded-artifact-writer.review.md`
- Implementation notes file: `tasks/notes/20260820-2307-esa06-guarded-artifact-writer.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260820-2307-esa06-guarded-artifact-writer.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260820-2307-esa06-guarded-artifact-writer.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Single revert restores boolean overwrite semantics; released mandatory precondition must not be silently rolled back per ESA-06 spec — rollback requires an explicit compatibility release decision
- **Verification boundary**: 12-case MCP write-path regression suite plus full Required Checks; breaking surface proven by RETIRED_PARAMETER/UNKNOWN_PARAMETER rejection tests
- **Review/acceptance boundary**: `tasks/reviews/20260820-2307-esa06-guarded-artifact-writer.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260820-2307-esa06-guarded-artifact-writer.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260820-2307-esa06-guarded-artifact-writer.contract.md`, `tasks/reviews/20260820-2307-esa06-guarded-artifact-writer.review.md`, and `tasks/notes/20260820-2307-esa06-guarded-artifact-writer.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260820-2307-esa06-guarded-artifact-writer.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Single revert restores boolean overwrite semantics; released mandatory precondition must not be silently rolled back per ESA-06 spec — rollback requires an explicit compatibility release decision

## Captured Planning Output

# ESA-06 Guarded Workflow-Artifact Writer: mandatory revision preconditions

## Goal

The 7 MCP workflow-artifact write tools (`write_prd`, `write_prd_from_idea`, `write_sprint`, `write_checklist_sprint`, `write_plan`, `prepare_codex_goal_from_sprint`, `write_codex_goal`) replace the boolean `overwrite` flag with a mandatory revision precondition: field absent means create-only, `expected_sha256: "<hex>"` means guarded overwrite that fails closed on hash mismatch. Writes become durable (temp + fsync + rename + parent fsync), reject in-repo symlinks at the target, and return `{sha256, previousSha256}`. Released at 0.16.1 as an explicit breaking MCP surface change. Closes `tasks/todos.md:14` (ESA-06 row).

## Why

Owner approved opening ESA-06 on 2026-08-20 with two decisions: mandatory revision preconditions, breaking boundary at 0.16.1, retired-parameter rejection via `RETIRED_PARAMETER` (table deleted at 0.17.0). Current `writeMarkdownArtifact` (`src/cli/mcp/tools.ts:576-601`) is the last direct-`writeFileSync` outlier on this server: check-then-write TOCTOU, no revision check, no atomicity, and it follows in-repo symlinks (a symlink at `plans/prds/x.prd.md → docs/spec.md` passes policy and gets clobbered — live bug). The sibling `coding-tools.ts` surface already implements the exact target contract (`expected_sha256`, `REVISION_CONFLICT`, before/after hash pair, temp+rename), so this is convergence onto an existing local idiom.

## Frozen decisions

1. **New module `src/cli/mcp/guarded-write.ts`; do NOT reuse `src/effects/fs-transaction.ts`.** Grounds: its primitives (`contentHash`, `checkExpectedFileState`) are private and adoption-typed; `atomicWriteFile` drops untracked backups into `.ai/harness/backups/` on every overwrite (not gitignored); `withTargetLock` has no stale-lock recovery (crashed session wedges the file permanently); it throws prose Errors that would need string matching. Module signature: `guardedWriteFile(absolutePath, relativePath, content, expectedSha256 | undefined) → GuardedWriteOutcome` (discriminated union, no exceptions, matching `McpPathDecision` style). `paths.ts` stays the sole containment/policy authority; `guarded-write.ts` never re-derives policy. Commit idiom: `lstat` guards → hash precondition → temp write + fsync → rename → parent-dir fsync (house style from `atomic-append.ts:48-60`).
2. **Input contract**: remove `overwrite` from all 7 tool schemas (`markdownWriterSchema`, `ideaPrdSchema`, `checklistSprintSchema`, `goalFromSprintSchema`, inline `write_codex_goal` schema at `tools.ts:861-928`, `:988-996`); add optional `expected_sha256` (bare hex, byte-comparable to `read_workflow_file`'s `sha256` output). Because `server.ts:283-287` uses the low-level SDK path, per-tool `inputSchema` is not server-enforced — so add a handler-level guard ahead of `targetRepoRoot`: any undeclared key → `UNKNOWN_PARAMETER` with `details: {unknown, allowed}`; a single shared retired-key table (one entry: `overwrite` → `expected_sha256`) → `RETIRED_PARAMETER` with a message naming the replacement and 0.16.1. Migration window: `RETIRED_PARAMETER` rejected through 0.16.x, table deleted at 0.17.0 (bounded, documented in the changelog).
3. **Result contract**: success payload gains `sha256` and `previousSha256` (camelCase, matching this surface's existing `{status, repoRoot, path}`); `previousSha256: null` on create. No `mutationId` — no consumer exists on this path.
4. **Error taxonomy** (all via existing `errorResult()` at `tools.ts:110`, all audited): `WOULD_OVERWRITE` (exists, no `expected_sha256` — caller must read first), `REVISION_CONFLICT` (hash mismatch; also `expected_sha256` supplied but target absent, with `details.reason: 'target_absent'`), `SYMLINK_ESCAPE` (target is any symlink — closes the live bug), `NOT_A_REGULAR_FILE`, `WRITE_FAILED`, `UNKNOWN_PARAMETER`, `RETIRED_PARAMETER`. No `PATH_OUTSIDE_REPO` (dual authority with `resolveMcpPath`'s `POLICY_DENIED`).
5. **No hash echo on conflict errors.** `WOULD_OVERWRITE`/`REVISION_CONFLICT` never include the current hash — echoing it enables blind write→lift-hash→rewrite loops (last-writer-wins clobbering unread content). The read companion already exists: `read_workflow_file` (`tools.ts:1174-1179`) returns `sha256` over raw pre-redaction bytes; all 7 write targets are covered by `PLANNER_READ_GLOBS`. Document the read→write round trip.
6. **No lock.** `writeMarkdownArtifact` is fully synchronous, so in-process races are serialized by the event loop by construction (proved by test). Cross-process locking (needs bounded-timeout + PID-liveness recovery) is deferred as a new `tasks/todos.md` row with an explicit revisit trigger.
7. **Hash shape**: bare-hex `sha256()` from `tools.ts:399` only — never `fs-transaction.contentHash()`'s `sha256:`-prefixed shape. One hash shape per surface.
8. **Release**: `package.json` → 0.16.1. `docs/CHANGELOG.md` `[0.16.1]`: `### Removed` — the `overwrite` → `expected_sha256` cutover marked as a breaking MCP surface change, 7-row migration table, no-shims language, `RETIRED_PARAMETER` window (deleted at 0.17.0), explicit line that `append_handoff_note` is unchanged; `### Changed` — precondition + durable commit + `{sha256, previousSha256}` payload; `### Fixed` — writes no longer follow in-repo symlinks.
9. **`append_handoff_note` untouched** — still `appendFileSync`, no precondition; append concurrency is a separate design per the original ESA-06 spec (`plans/archive/20260714-effective-state-authority-convergence.sprint.md:622`).

## Out of scope

- `append_handoff_note` semantics, append concurrency.
- Cross-process file locking (deferred todos row).
- `coding-tools.ts`'s own `REVISION_CONFLICT` hash leak (`coding-tools.ts:421`) — different threat model (sandboxed workspace); flagged for separate review, not touched here.
- Any change to `resolveMcpPath` policy semantics or `fs-transaction.ts`.
- Error-namespace unification with coding-tools (`TARGET_EXISTS` etc.).

## Task Breakdown

- [ ] Slice 1 — guarded-write primitive: create `src/cli/mcp/guarded-write.ts` + `tests/cli/mcp-guarded-write.test.ts` covering create-when-absent, exists-without-precondition, guarded-overwrite success, stale-hash conflict (no hash leaked, file unchanged), precondition-with-absent-target (`details.reason: 'target_absent'`), symlink rejection, directory target, injected commit failure (original intact, no `.tmp` residue). Verify: `bun test tests/cli/mcp-guarded-write.test.ts --timeout 60000`
- [ ] Slice 2 — tool contract cutover: swap `overwrite` → `expected_sha256` in all 5 schema definitions; thread through all 7 handler cases (`tools.ts:1218-1311`); rewrite `writeMarkdownArtifact` onto `guardedWriteFile` (delete `existsSync + !overwrite` branch and raw `writeFileSync`); add undeclared-key guard + retired-key table; success payloads gain `sha256`/`previousSha256`. `append_handoff_note` untouched. Verify: `bun test tests/cli/mcp-tools.test.ts tests/cli/mcp-policy.test.ts --timeout 60000`
- [ ] Slice 3 — regression surface: rewrite `tests/cli/mcp-tools.test.ts:308-345` (asserts retired default); add: read→write round trip (`read_workflow_file` sha256 fed back succeeds, `previousSha256` matches), two racing writes with same `expected_sha256` (exactly one `written`, one `REVISION_CONFLICT`), `overwrite: true` → `RETIRED_PARAMETER` naming `expected_sha256` with nothing written, arbitrary undeclared key → `UNKNOWN_PARAMETER`, schema assertion over `buildMcpToolDefinitions` (all 7 accept `expected_sha256`, none accept `overwrite`). Verify: `bun test tests/cli/ --timeout 60000`
- [ ] Slice 4 — release + doc reconciliation: `package.json` → 0.16.1; `docs/CHANGELOG.md` `[0.16.1]` per frozen decision 8; rewrite `docs/architecture/effective-state-authority.md:150-151` from "remains deferred" to the shipped decision; `tasks/todos.md`: remove ESA-06 row, add deferred cross-process-lock row (trigger: a real deployment where two MCP server processes target one repo concurrently); add read-then-write guidance to `docs/repo-harness-chatgpt-mcp-setup.md` prompt templates (`:174-176`, `:265-267`, `:357-392`). Verify: `bash scripts/check-architecture-sync.sh && bash scripts/check-task-sync.sh`
- [ ] Slice 5 — full Required Checks: `bun test --timeout 60000`; `bash scripts/check-deploy-sql-order.sh`; `bash scripts/check-architecture-sync.sh`; `bash scripts/check-task-sync.sh`; `repo-harness run check-task-workflow --strict`; `bun scripts/inspect-project-state.ts --repo . --format text`; `bun src/cli/index.ts init --repo . --dry-run`

## Exit Criteria

1. All 7 tools reject `overwrite` with `RETIRED_PARAMETER` and accept `expected_sha256`; create-only when absent, guarded overwrite on hash match, `REVISION_CONFLICT` on mismatch with no hash in the error and the file byte-unchanged.
2. A symlink at a write target is rejected with `SYMLINK_ESCAPE` and the link target is unmodified.
3. Two racing writes with the same `expected_sha256` produce exactly one success and one `REVISION_CONFLICT`.
4. A failed commit leaves the original file intact and no `.tmp` residue.
5. `read_workflow_file`'s `sha256` fed back as `expected_sha256` succeeds (round trip proven in tests).
6. `append_handoff_note` behavior is byte-identical to before (existing test untouched and green).
7. Full Required Checks pass; version 0.16.1 and the CHANGELOG breaking entry are in the same publication commit.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Slice 1 — guarded-write primitive: create `src/cli/mcp/guarded-write.ts` + `tests/cli/mcp-guarded-write.test.ts` covering create-when-absent, exists-without-precondition, guarded-overwrite success, stale-hash conflict (no hash leaked, file unchanged), precondition-with-absent-target (`details.reason: 'target_absent'`), symlink rejection, directory target, injected commit failure (original intact, no `.tmp` residue). Verify: `bun test tests/cli/mcp-guarded-write.test.ts --timeout 60000`
- [ ] Slice 2 — tool contract cutover: swap `overwrite` → `expected_sha256` in all 5 schema definitions; thread through all 7 handler cases (`tools.ts:1218-1311`); rewrite `writeMarkdownArtifact` onto `guardedWriteFile` (delete `existsSync + !overwrite` branch and raw `writeFileSync`); add undeclared-key guard + retired-key table; success payloads gain `sha256`/`previousSha256`. `append_handoff_note` untouched. Verify: `bun test tests/cli/mcp-tools.test.ts tests/cli/mcp-policy.test.ts --timeout 60000`
- [ ] Slice 3 — regression surface: rewrite `tests/cli/mcp-tools.test.ts:308-345` (asserts retired default); add: read→write round trip (`read_workflow_file` sha256 fed back succeeds, `previousSha256` matches), two racing writes with same `expected_sha256` (exactly one `written`, one `REVISION_CONFLICT`), `overwrite: true` → `RETIRED_PARAMETER` naming `expected_sha256` with nothing written, arbitrary undeclared key → `UNKNOWN_PARAMETER`, schema assertion over `buildMcpToolDefinitions` (all 7 accept `expected_sha256`, none accept `overwrite`). Verify: `bun test tests/cli/ --timeout 60000`
- [ ] Slice 4 — release + doc reconciliation: `package.json` → 0.16.1; `docs/CHANGELOG.md` `[0.16.1]` per frozen decision 8; rewrite `docs/architecture/effective-state-authority.md:150-151` from "remains deferred" to the shipped decision; `tasks/todos.md`: remove ESA-06 row, add deferred cross-process-lock row (trigger: a real deployment where two MCP server processes target one repo concurrently); add read-then-write guidance to `docs/repo-harness-chatgpt-mcp-setup.md` prompt templates (`:174-176`, `:265-267`, `:357-392`). Verify: `bash scripts/check-architecture-sync.sh && bash scripts/check-task-sync.sh`
- [ ] Slice 5 — full Required Checks: `bun test --timeout 60000`; `bash scripts/check-deploy-sql-order.sh`; `bash scripts/check-architecture-sync.sh`; `bash scripts/check-task-sync.sh`; `repo-harness run check-task-workflow --strict`; `bun scripts/inspect-project-state.ts --repo . --format text`; `bun src/cli/index.ts init --repo . --dry-run`
