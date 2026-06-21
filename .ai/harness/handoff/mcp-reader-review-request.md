# MCP Reader Formal Review Request

Updated: 2026-06-21T23:04:39+0800
Status: ready for assigned reviewer intake, not signed off
Scope: repo-harness MCP reader, registry, HTTP session, OAuth refresh, setup/doctor/docs, and tests

## Boundary

This artifact requests formal review of the current MCP reader hardening diff. It is not an approval, not a release checklist, and not live ChatGPT evidence.

No release, tag, publish, version bump, release check, staging, commit, push, or PR creation was run for this request.

The current worktree is mixed: staged, unstaged, and untracked files are present. Reviewers should sign only the explicit MCP scope below unless the final PR intentionally includes additional parallel sprint files.

## Current Diff Shape

Staged MCP-related changes currently include 20 files and about 2051 insertions / 189 deletions.

Full worktree tracked diff currently includes 28 files and about 1313 insertions / 803 deletions, plus untracked new MCP modules, PRD/Sprint/handoff artifacts, and some parallel planning files.

## Review Scope

Core source:

- `src/effects/repo-registry.ts`
- `src/cli/commands/adopt-plan.ts`
- `src/cli/commands/init.ts`
- `src/cli/commands/mcp.ts`
- `src/cli/mcp/auth.ts`
- `src/cli/mcp/instructions.ts`
- `src/cli/mcp/oauth.ts`
- `src/cli/mcp/paths.ts`
- `src/cli/mcp/policy.ts`
- `src/cli/mcp/reader-tools.ts`
- `src/cli/mcp/server.ts`
- `src/cli/mcp/session-store.ts`
- `src/cli/mcp/setup.ts`
- `src/cli/mcp/tools.ts`
- `src/cli/mcp/transports/http.ts`
- `src/cli/mcp/types.ts`
- `src/cli/mcp/version.ts`
- `src/cli/mcp/workspaces.ts`

Tests:

- `tests/cli/adoption-plan.test.ts`
- `tests/cli/init.test.ts`
- `tests/cli/mcp-http.test.ts`
- `tests/cli/mcp-oauth.test.ts`
- `tests/cli/mcp-policy.test.ts`
- `tests/cli/mcp-reader-tools.test.ts`
- `tests/cli/mcp-setup.test.ts`
- `tests/cli/mcp-stdio.test.ts`
- `tests/cli/mcp-tools.test.ts`
- `tests/cli/mcp-workspaces.test.ts`
- `tests/cli/mcp.test.ts`
- `tests/bootstrap-files.test.ts`
- `tests/hook-recursive-copy.test.ts`

Docs, CI, and evidence:

- `.github/workflows/ci.yml`
- `README.md`
- `docs/CHANGELOG.md`
- `docs/repo-harness-chatgpt-mcp-setup.md`
- `plans/prds/20260621-repo-harness-mcp-reader-hardening-prd.md`
- `plans/sprints/20260621-repo-harness-mcp-reader-hardening-sprint.md`
- `.ai/harness/handoff/mcp-reader-local-http-e2e.md`
- `.ai/harness/handoff/mcp-reader-review-prep.md`
- `.ai/harness/handoff/mcp-reader-self-review.md`
- `.ai/harness/handoff/mcp-reader-sprint-closeout.md`

Parallel or scope-sensitive dirty files:

- `plans/prds/Cherry-pick Analysis of Ponytail into Repo-harness Hooks.md`
- `plans/sprints/20260621-minimal-change-hooks.sprint.md`
- `plans/sprints/20260621-single-source-minimal-change-review.sprint.md`
- `plans/sprints/20260621-mcp-fix.sprint.md`

These files are present in the worktree. They should be reviewed only if the final PR scope intentionally includes them.

## Security Review Questions

- Does `COMMON_DENY_GLOBS` remain a non-bypassable deny boundary across planner, executor, orchestrator, and legacy broad-read compatibility?
- Does workspace path resolution deny traversal, absolute input, Windows absolute-like paths, symlink escapes, ignored paths, secret paths, binary files, and oversized reads before content is returned?
- Does registry-based root discovery expose only adopted repos or explicitly allowed non-repo roots?
- Does `read_text` allowing normal source/package files avoid weakening legacy `read_workflow_file` allowlist behavior?
- Do tree/search responses avoid leaking denied file names or secret snippets?
- Does HTTP fail closed for public bind without explicit public origin?
- Does audit/redaction avoid logging secrets, bearer tokens, OAuth passphrases, authorization codes, refresh tokens, or raw inputs?
- Does query-token compatibility remain explicitly non-default and documented as single-user compatibility only?

## API/MCP Review Questions

- Is the single Connector model preserved: planner exposes workflow planning/writer tools plus reader tools, while runner/browser/shell surfaces remain opt-in or absent?
- Are the six reader tools stable and coherent: `reader_status`, `list_allowed_roots`, `open_workspace`, `tree`, `read_text`, `search_text`?
- Are tool annotations read-only/idempotent/non-destructive where appropriate?
- Are structured error codes stable enough for ChatGPT/Codex clients?
- Are `/mcp` GET/POST/DELETE semantics compatible with existing MCP clients?
- Does OAuth discovery advertise `offline_access`, issue refresh tokens only when requested, rotate both access and refresh tokens, and reject old refresh tokens?
- Does server metadata use the package version and schema hash consistently across `/health`, STDIO, setup, doctor, and reader status?

## Maintainer Review Questions

- Are new modules scoped correctly instead of growing `tools.ts` further?
- Are setup/serve/doctor changes consistent with existing Commander CLI style?
- Are tests placed in existing `tests/cli/` surfaces and tied to concrete behavioral contracts?
- Does `.github/workflows/ci.yml` add a focused MCP path matrix without overloading normal CI?
- Does package dry-run include all new runtime modules?
- Do README, CHANGELOG, setup guide, PRD, Sprint, closeout, and review artifacts agree on the single Connector / global registry model?
- Are any parallel dirty files accidentally included in the intended MCP PR scope?

## Verified Local Evidence

- `BUN_TEST_MAX_CONCURRENCY=1 bun run check:ci`: pass, `905 pass`, `1 skip`, `0 fail`, `9055 expects`; workflow checks, repository inspection, package dry-run, and tarball install smoke passed.
- Focused MCP suite: `bun test --timeout 60000 --max-concurrency 1 tests/cli/mcp-policy.test.ts tests/cli/mcp-reader-tools.test.ts tests/cli/mcp-tools.test.ts tests/cli/mcp-http.test.ts tests/cli/mcp-stdio.test.ts`: pass, `33 pass`, `0 fail`, `308 expects`.
- Local HTTP MCP transcript: pass, see `.ai/harness/handoff/mcp-reader-local-http-e2e.md`.
- `git diff --check`: pass.
- `bash scripts/check-task-sync.sh`: pass.
- `bash scripts/check-task-workflow.sh --strict`: pass.
- `npm pack --dry-run --json`: pass; dry-run tarball includes the new MCP modules.

## Known Gaps Before Final Sprint Done

- Local self-review is complete in `.ai/harness/handoff/mcp-reader-self-review.md`; no formal reviewer sign-off yet.
- No hosted Ubuntu/macOS/Windows `mcp-path-matrix` readback for the current uncommitted diff.
- No live ChatGPT Connector/App tool-call transcript.
- No release/tag/publish/version bump/release checks.
- No published-package smoke.

## Reviewer Output Expected

Assigned reviewers should return one of:

- `approved`: no required changes for the reviewed scope.
- `approved_with_notes`: no blocker, but note follow-up before release or next sprint.
- `changes_requested`: concrete file/path/behavior blockers.
- `blocked_external`: review cannot finish until hosted matrix, live ChatGPT E2E, or release evidence exists.

Each response should name the reviewed scope, commit/diff basis if available, and any explicitly excluded parallel files.
