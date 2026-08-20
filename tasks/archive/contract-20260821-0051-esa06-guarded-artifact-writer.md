> **Archived**: 2026-08-21 00:51
> **Related Plan**: plans/archive/plan-20260820-2307-esa06-guarded-artifact-writer.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260821-0051

# Task Contract: esa06-guarded-artifact-writer

> **Status**: Fulfilled
> **Plan**: plans/plan-20260820-2307-esa06-guarded-artifact-writer.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-20 23:07
> **Review File**: `tasks/reviews/20260820-2307-esa06-guarded-artifact-writer.review.md`
> **Notes File**: `tasks/notes/20260820-2307-esa06-guarded-artifact-writer.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`writeMarkdownArtifact` (`src/cli/mcp/tools.ts:576-601`) is the last direct-`writeFileSync` write path on the MCP server: check-then-write TOCTOU with a caller-supplied boolean `overwrite`, no revision check, no atomic commit, and it follows in-repo symlinks at the target (a symlink at `plans/prds/x.prd.md → docs/spec.md` passes policy and clobbers `docs/spec.md` — live bug). Multiple sessions can target the same repo via `targetRepoRoot`, so a stale writer silently destroys another session's artifact content it never read. The owner approved the deferred ESA-06 row (`tasks/todos.md`) on 2026-08-20 with mandatory revision preconditions at the 0.16.1 breaking boundary. If skipped, shared workflow artifacts stay last-writer-wins; if shipped wrong (e.g. hash echoed in conflict errors), agents blind-retry until they win, which is worse than the current state.

## Goal

The 7 MCP workflow-artifact write tools (`write_prd`, `write_prd_from_idea`, `write_sprint`, `write_checklist_sprint`, `write_plan`, `prepare_codex_goal_from_sprint`, `write_codex_goal`) replace boolean `overwrite` with an optional `expected_sha256` precondition: absent = create-only (`WOULD_OVERWRITE` if target exists), supplied = guarded overwrite (`REVISION_CONFLICT` on mismatch, no current-hash echo in any conflict error). Writes go through a new synchronous `src/cli/mcp/guarded-write.ts` (lstat symlink/regular-file guards → hash precondition → temp+fsync+rename+parent-fsync), success payloads gain `sha256`/`previousSha256` (bare hex, byte-comparable with `read_workflow_file`'s `sha256`). Undeclared params are rejected server-side (`UNKNOWN_PARAMETER`); `overwrite` specifically returns `RETIRED_PARAMETER` naming `expected_sha256` (table deleted at 0.17.0). Version bumps to 0.16.1 with a breaking-change CHANGELOG entry. Execute the plan's `## Task Breakdown` (5 slices) exactly; frozen decisions 1-9 in the plan are authoritative.

## Scope

- In scope: `src/cli/mcp/guarded-write.ts` (new), `src/cli/mcp/tools.ts` (schemas, 7 handler cases, `writeMarkdownArtifact`, param guard), `tests/cli/mcp-guarded-write.test.ts` (new), `tests/cli/mcp-tools.test.ts` (rewrite retired-default test, add regression cases), `package.json` version, release-surface consequences of the 0.16.1 bump (`assets/skill-version.json`, README release stamps ×5, `src/cli/commands/mcp.ts` dropping its `--overwrite` passthrough — scope widened 2026-08-20 after full-suite run surfaced them), `docs/CHANGELOG.md`, `docs/architecture/effective-state-authority.md:150-151`, `tasks/todos.md` (remove ESA-06 row, add deferred cross-process-lock row), `docs/repo-harness-chatgpt-mcp-setup.md` read-then-write guidance.
- Out of scope: `append_handoff_note` (still `appendFileSync`, no precondition), cross-process locking, `src/effects/fs-transaction.ts`, `resolveMcpPath`/policy semantics, `coding-tools.ts` (including its own `REVISION_CONFLICT` hash leak — flagged for separate review), error-namespace unification with coding-tools.
- Taste constraints: discriminated-union results (no exceptions crossing module boundary), match `McpPathDecision` idiom; camelCase payload fields matching this surface; hash shape is bare hex from `tools.ts` `sha256()` only — never `fs-transaction.contentHash()`'s `sha256:` prefix.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if implementing the param guard reveals the server DOES enforce per-tool inputSchema (would invalidate frozen decision 2's premise — re-verify `server.ts:283-287` first).

## Falsifier

Direction is wrong if the low-level SDK path already rejects undeclared params server-side (then `UNKNOWN_PARAMETER`/`RETIRED_PARAMETER` guards are dead code): cheapest proof is an existing-behavior test passing `overwrite: true` plus a junk key to `write_prd` before any change and observing them silently ignored. Also wrong if any in-repo caller depends on `overwrite: true` semantics programmatically (grep `assets/`, `evals/`, `scripts/` for MCP write-tool invocations passing `overwrite`).

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260820-2307-esa06-guarded-artifact-writer.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260820-2307-esa06-guarded-artifact-writer.review.md`
- Notes file: `tasks/notes/20260820-2307-esa06-guarded-artifact-writer.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"mcp-write-suites","kind":"deterministic_test","paths":["*"]},{"id":"full-suite","kind":"deterministic_test","paths":["*"]},{"id":"cli-prepare-goal-probe","kind":"runtime_readback","paths":["*"]},{"id":"gatekeeper-acceptance","kind":"manual_acceptance","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260820-2307-esa06-guarded-artifact-writer.contract.md
  - tasks/reviews/20260820-2307-esa06-guarded-artifact-writer.review.md
  - tasks/notes/20260820-2307-esa06-guarded-artifact-writer.notes.md
  - src/cli/mcp/
  - src/cli/commands/mcp.ts
  - tests/cli/
  - package.json
  - assets/skill-version.json
  - README.md
  - README.es.md
  - README.fr.md
  - README.ja.md
  - README.zh-CN.md
  - docs/CHANGELOG.md
  - docs/architecture/effective-state-authority.md
  - docs/repo-harness-chatgpt-mcp-setup.md
```

## Evidence Requirements

```yaml
evidence_requirements:
  # Set benchmark to required when this contract consumes the harness profile benchmark matrix.
  benchmark: not_applicable
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    runner_invocations: null
    wall_time_minutes: null
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent:
      mode: narrate_and_gatekeep
      purpose: approval_checkpoint_owner
    explorer:
      mode: read_only
      purpose: codebase_research
    worker:
      mode: edit_within_allowed_paths
      purpose: implementation
    verifier:
      mode: read_only
      purpose: exit_criteria_review
  runner:
    preferred:
      - subagent
    fallback: null
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - src/cli/mcp/guarded-write.ts
    - tests/cli/mcp-guarded-write.test.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260820-2307-esa06-guarded-artifact-writer.notes.md
  tests_pass:
    - path: tests/cli/mcp-guarded-write.test.ts
    - path: tests/cli/mcp-tools.test.ts
    - path: tests/cli/mcp-policy.test.ts
  commands_succeed:
    - bun run check:type
    - bash -c '! grep -n "\"overwrite\"" src/cli/mcp/tools.ts'
    - bash -c 'grep -q "\"version\": \"0.16.1\"" package.json'
    - bash -c 'grep -q "0.16.1" docs/CHANGELOG.md'
```

## Acceptance Notes (Human Review)

- Functional behavior: 7 tools on guarded preconditions; read→write round trip via `read_workflow_file` sha256; durable temp+rename commit; symlink targets rejected.
- Edge cases: precondition supplied but target absent (`REVISION_CONFLICT` + `details.reason: 'target_absent'`); racing in-process writes (exactly one winner); failed commit leaves no `.tmp` residue; no hash echoed in conflict errors.
- Regression risks: `write_plan` and both codex-goal tools write fixed paths — every regeneration now needs a read-first round trip (ergonomic cost lands on the Codex handoff loop; documented in chatgpt-mcp-setup guidance); `append_handoff_note` must stay byte-identical in behavior.

## Rollback Point

- Commit / checkpoint: worktree base `f2da30f8` (branch `codex/esa06-guarded-artifact-writer`)
- Revert strategy: single revert of the publication commit restores boolean `overwrite` semantics; per the ESA-06 spec rollback note, a released mandatory precondition must not be silently rolled back — reverting after release requires an explicit compatibility release decision recorded in the changelog.
