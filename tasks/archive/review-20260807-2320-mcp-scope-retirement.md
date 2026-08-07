> **Archived**: 2026-08-07 23:20
> **Related Plan**: plans/archive/plan-20260807-1606-mcp-scope-retirement.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260807-2320

# Task Review: mcp-scope-retirement

> **Status**: Complete
> **Plan**: plans/plan-20260807-1606-mcp-scope-retirement.md
> **Contract**: tasks/contracts/20260807-1606-mcp-scope-retirement.contract.md
> **Notes File**: tasks/notes/20260807-1606-mcp-scope-retirement.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-07 22:30
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

The two `pending` header fields are rubric metadata; the authoritative values
are written into the Acceptance Receipt Projection below by the receipt tooling.

## Human Review Card

- Verdict: pass
- Change type: migration
- Intended files changed: `src/cli/mcp/` scope branches plus the migration gate and command, `src/cli/commands/mcp.ts` CLI wiring, the dead `ignoreLines` block in `src/cli/chatgpt-browser/engine.ts`, affected tests under `tests/cli/`, and `docs/repo-harness-chatgpt-mcp-setup.md` — all inside contract `allowed_paths`.
- Actual files changed: 17 paths (+1330 -513), all inside `allowed_paths`. Code: `src/cli/mcp/auth.ts`, `src/cli/mcp/setup.ts`, `src/cli/mcp/server.ts`, `src/cli/mcp/transports/http.ts`, `src/cli/mcp/tools.ts`, `src/cli/commands/mcp.ts`, `src/cli/chatgpt-browser/engine.ts`. Tests: `tests/cli/mcp-setup.test.ts`, `tests/cli/mcp-http.test.ts`, `tests/helpers/chatgpt-mcp-contract.ts`, `tests/capability-config.test.ts` (load-robustness timeout only, precedent `a2381159`). Docs: `docs/repo-harness-chatgpt-mcp-setup.md` (regenerated). Workflow artifacts: plan, contract, notes, this review, `tasks/todos.md` (timestamp only).
- Commands passed: `repo-harness run verify-sprint --prepare-acceptance` total=9 failed=0 status=Fulfilled, including full `bun test` (491.2s) , `bun run check:type`, `bun src/cli/index.ts init --repo . --dry-run`, and `tests_pass: tests/cli/mcp-setup.test.ts`. Independent gatekeeper runs: full `bun test` 2222 pass / 1 skip / 0 fail (725s, `REPO_HARNESS_HOME` unset), targeted `bun test` over the three touched test files 48 pass / 0 fail, `bun run check:type`, `init --dry-run`.
- Residual risks: the fail-closed gate keys only on `mcp.local.json`, so a repo whose legacy config was hand-deleted while `mcp.tokens.json` or `mcp.oauth-tokens.json` remain will not be prompted to migrate (conformant with the contract Goal wording; `migrate-scope` still cleans all four when run). Gate coverage is complete in code across five entrypoints but only three are asserted by tests — `startMcpHttp` and `runMcpLiveDoctor` are unasserted. `runMcpMigrateScope` spreads `...existingUser` at top level, so a stale `"scope"` key survives one migration where `runMcpSetupChatgpt` drops it.
- Reviewer action required: none
- Rollback: single squash revert restores the dual-scope shape; no user-side persisted-data format change, and existing user-level installs were never rewritten.

## Mode Evidence

- Selected route: gatekeeper acceptance review of an uncommitted delivery in the isolated worktree `codex/mcp-scope-retirement`, across two review rounds (round 1 returned FAIL with two blocking findings; round 2 verified the fixes).
- P1/P2/P3 evidence: P1 — enumerated every MCP subcommand in `src/cli/commands/mcp.ts` and mapped each to its config readers, establishing that only `serve`, `doctor`, `setup chatgpt`, and the doctor surfaces read MCP config, and that `access`, `workspaces`, `setup codex`, `install-skill`, and `print-chatgpt-guide` do not. P2 — traced the storage path end to end: `mcpStorageDir()` now resolves solely to `repoHarnessHome()`, with `legacyRepoScopeMcpPaths` retained only so the gate and migration can name and remove the retired layout; confirmed by an independent mktemp legacy fixture driven through gate to migration to idempotent re-run. P3 — the retirement preserves the one-source-of-truth invariant and fails closed rather than adding a read-through fallback, which repo policy forbids; the falsifier (a deployment shape that can set neither `REPO_HARNESS_HOME` nor write `$HOME`) does not exist because all three home-resolution sites honor `REPO_HARNESS_HOME`.
- Root cause or plan evidence: plan `plans/plan-20260807-1606-mcp-scope-retirement.md` Slice 2; Task Profile is `migration`, so the Root Cause Evidence Gate does not apply.

## Verification Evidence

- Waza `/check` run: not applicable; verification ran through the contract exit criteria and the repo required checks.
- Commands run: `verify-sprint --prepare-acceptance` (Fulfilled, 9/9) and the confirming `verify-sprint` (finalized without rerunning verification). Gatekeeper-side: full `bun test` twice with `REPO_HARNESS_HOME` unset (2221/1/0 pre-fix, 2222/1/0 post-fix), targeted `bun test` (48 pass / 0 fail), `bun run check:type`, `bun src/cli/index.ts init --repo . --dry-run`.
- Manual checks: independent mktemp legacy fixture traced through all five steps — gate exits 2 naming `repo-harness mcp migrate-scope`, no user config written while the gate holds; `migrate-scope` carries `server.host`, `server.port`, `chatgpt.serverName`, `chatgpt.endpoint`, `profile`; regenerated bearer and passphrase both differ from the seeded legacy values with zero occurrences of the legacy secrets anywhere under the new storage root; all four legacy files removed; gate released and `doctor` exits 0; re-run reports "Nothing to migrate" with credentials unchanged. Breaking-surface check: a pre-existing user config carrying `"scope":"user"` still parses, `doctor` exits 0, and the dead key is dropped on the next setup while `chatgpt.serverName` is preserved. Residue sweep: `McpConfigScope`, `resolveMcpConfigScope`, and `parseMcpConfigScope` are absent from `src/`, `scripts/`, `assets/`, and `tests/`; the only remaining `--scope` occurrences belong to `setup codex` (Codex config location, a different axis); the only repo-root-relative `.repo-harness` MCP path left in `src/` is `legacyRepoScopeMcpPaths`, with `tools.ts:80` being a sensitive-directory deny-list entry. Out-of-scope surfaces confirmed untouched: `src/cli/mcp/oauth.ts`, `src/cli/chatgpt-browser/binding.ts`, `src/effects/repo-registry.ts`. Guide integrity: the tracked guide is byte-identical to a fresh generation and stable across a second generation. Test isolation: `~/.repo-harness` snapshotted before and after a full suite run with `REPO_HARNESS_HOME` unset — `mcp.local.json`, `mcp.tokens.json`, `mcp.oauth.json`, and `mcp.oauth-tokens.json` all byte-identical, confirming the leaked-write defect is closed.
- Supporting artifacts: `.ai/harness/checks/latest.json` (verification evidence bound into the AcceptanceReceipt below); run snapshot `.ai/harness/runs/run-20260807T221739-96835-20260807-1606-mcp-scope-retirement.json`.
- Implementation notes reviewed: yes — `tasks/notes/20260807-1606-mcp-scope-retirement.notes.md`, including its disclosed incident section.
- Run snapshot: `.ai/harness/runs/run-20260807T221739-96835-20260807-1606-mcp-scope-retirement.json`

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:d8ce077c27bdf773cbd8e49f38dce9f7a0af3af730bbc16e5e5f8b92b4ee731b
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 2058149b2de9d333cea690efc619c9bb1c1958bb
> **Verification Evidence SHA256**: sha256:1ae7c485c2f94b3f75dcc9ddbec6ecf1f79d1c36c0893a552a873ff191047fa3
> **Issued At**: 2026-08-07T14:27:55.427Z

- Summary: Repo-scope MCP storage retired to a single user-level authority; gate, migration, and rotation verified against a legacy fixture
- Findings: none

## Behavior Diff Notes

- MCP config and credentials resolve only under `~/.repo-harness/` (or `REPO_HARNESS_HOME`). `mcpStorageDir()` no longer takes a repo root, and no MCP command writes into a repo working tree.
- Five entrypoints (`createMcpToolContext`, `startMcpHttp`, `runMcpSetupChatgpt`, `runMcpDoctor`, `runMcpLiveDoctor`) abort with exit 2 while a legacy `<repo>/.repo-harness/mcp.local.json` exists, naming `repo-harness mcp migrate-scope`. There is no read-through fallback.
- `repo-harness mcp migrate-scope` is new: non-secret fields merge with user values winning, bearer and passphrase are regenerated rather than relocated, the repo-scope OAuth token store is deleted, legacy files are removed, and an inventory is printed. A second run reports nothing to migrate.
- `harness_doctor` now reports `mcp.localConfig` from the single storage authority instead of probing the retired repo-scope path, so it agrees with `runMcpDoctor` on the same repo.
- `setup codex --scope` is unchanged; it selects the Codex config location and is a different axis from MCP storage.

## Residual Risks / Follow-ups

- Gate detection keys only on `mcp.local.json` while the migration inventory cleans four files; widening it is deferred and does not contradict the contract Goal.
- `startMcpHttp` and `runMcpLiveDoctor` carry the gate but have no test asserting it.
- Operator state: the round-1 test-isolation defect overwrote `~/.repo-harness/mcp.local.json` `chatgpt.serverName` with the fixture value `team-review-mcp` before it was fixed. The original name is unrecoverable; restore with `repo-harness mcp setup chatgpt --repo . --server-name <real-name>`. Credentials were never modified.
- Suite-wide isolation gap unrelated to this slice: `init` tests still register temp paths into the real `~/.repo-harness/registered-repos.json`, and an acceptance-gate receipt is rewritten under the real home during full runs. Recorded in the notes as an Open Question deserving its own slice.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Gate, migration, rotation, and idempotency all verified against an independent fixture; two gated entrypoints remain unasserted by tests. |
| Product depth | 9/10 | One-command migration with an explicit rotated/invalidated inventory and a fail-closed error that names the fix. |
| Design quality | 9/10 | Single storage authority with no compatibility fallback; the retired layout survives only as a named migration target. |
| Code quality | 9/10 | Path helpers lost their dead parameter and both doctor surfaces now read one authority; `migrate-scope` still carries a stale key forward through a top-level spread. |

## Failing Items

- none

## Retest Steps

- Re-run: `repo-harness run verify-sprint --prepare-acceptance`
- Re-check: seed `<repo>/.repo-harness/mcp.local.json` in a scratch repo with an isolated `REPO_HARNESS_HOME`, confirm MCP commands exit 2 naming the migration, run `repo-harness mcp migrate-scope --repo <repo>`, confirm the regenerated bearer and passphrase differ from the seeded values, and confirm a second run reports nothing to migrate.

## Summary

- Repo scope is fully retired: `McpConfigScope` and every branch on it are gone, `--scope` is removed from `mcp setup chatgpt`, and `~/.repo-harness/` is the single storage authority.
- The migration is the explicit, bounded one-shot path repo policy requires: it fails closed, rotates credentials instead of relocating them, deletes the repo-scope OAuth grants, removes the legacy files, and is idempotent.
- Round 1 returned FAIL on two blocking findings — `harness_doctor` still probing the retired path, and the migration section splicing the coding-profile prose in the generated guide. Round 2 verified both fixes, including a new test asserting the two doctor surfaces agree across three states.
- Accepted as `external_pass` against `origin/main` `2058149b`.
