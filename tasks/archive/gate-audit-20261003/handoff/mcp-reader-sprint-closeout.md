# MCP Reader Sprint Closeout

Updated: 2026-06-21T23:21:24+0800
Status: partial, not released
Release: pending
Published package: pending

## Delivered

- Single ChatGPT Connector design is implemented as planner `workspaceReader` capability, not as a separate reader Connector/profile.
- Global adopted-repo registry support is implemented through `~/.repo-harness/registered-repos.json`; `adopt`, `init`, and user-scope MCP setup register repos.
- Reader tools are implemented: `reader_status`, `list_allowed_roots`, `open_workspace`, `tree`, `read_text`, and `search_text`.
- Workflow writer tools accept `repo_path` so the single Connector can target registered repos without per-repo Connector setup.
- Secrets deny rules remain active across planner, executor, orchestrator, and legacy broad-read compatibility.
- HTTP MCP Session lifecycle now covers TTL, max sessions, DELETE, and cleanup.
- OAuth now advertises `offline_access`, binds and expires authorization codes, rotates access and refresh tokens, and invalidates old refresh tokens.
- Server metadata, health, setup guide, and doctor output expose package/schema diagnostics without exposing tokens or local secret state.
- Local release notes now document the single Connector workspaceReader model, legacy `fullDiskRead:true` fail-closed migration, and 0.7.4 security behavior change in `docs/CHANGELOG.md`.

## Deferred

- No release, tag, publish, version bump, published-package smoke, or release check was run for this closeout.
- Local HTTP MCP E2E transcript has passed and is archived; live ChatGPT Connector/App manual E2E has not been rerun for this reader-hardening sprint.
- Linux CI path matrix, Windows runner evidence, and Windows junction runtime evidence remain pending.
- Reviewer sign-off for threat model and migration behavior remains pending.
- Local self-review is complete and found no P0/P1 blocker in the MCP scope; this is not assigned reviewer sign-off.
- External completion blocker is recorded in `.ai/harness/handoff/mcp-reader-external-gates-blocker.md`.

## Security Invariants Proven Locally

- Deny precedence blocks `.env`, `.env.local`, private keys, `.ssh/**`, `credentials/**`, and `secrets/**` in policy and tool paths.
- Workspace paths must be session-local and workspace-relative.
- POSIX traversal, Windows drive-letter paths, Windows backslash traversal, UNC-style absolute paths, symlink escape, ignored paths, binary files, oversized reads, and denied search/tree leakage are covered by automated tests.
- Windows junction escape has a Windows-only regression test; macOS local runs skip it explicitly instead of claiming runner evidence.
- GitHub Actions now has an `mcp-path-matrix` job for Ubuntu, macOS, and Windows focused reader/path/OAuth/stdio tests; hosted run readback is still pending.
- Audit and redaction tests cover hash-only inputs and common token/private-key patterns.

## Config Migration Behavior

- Config v1 with safe permissions remains readable.
- Legacy `fullDiskRead: true` is fail-closed and is not migrated to `/`.
- `--allow-full-disk-read` is deprecated and rejected.
- `allowedRoots` represents explicit extra non-repo roots; registered adopted repos are discovered through the global registry.

## Tool Schemas

- Planner keeps existing workflow tools and gains reader tools through `workspaceReader`.
- Executor and orchestrator do not gain reader tools.
- Orchestrator `run_agent_goal` remains dev-mode opt-in only.
- `read_workflow_file` compatibility is preserved.
- `repo_path` is supported for workflow writer/read handoff tools.

## Automated Verification

- `bun test --timeout 60000 --max-concurrency 1`: 904 pass, 0 fail, 9036 expects.
- `BUN_TEST_MAX_CONCURRENCY=1 bun run check:ci`: pass after release-note/migration-note synchronization. The gate completed install, typecheck, full tests (`905 pass`, `1 skip`, `0 fail`, `9055 expects`), workflow checks, repository inspection, package dry-run, and tarball install smoke (`repo-harness-0.7.5.tgz` installs and packaged CLI bins start). Earlier in the sprint, the first full run exposed only a `tests/hook-recursive-copy.test.ts` migration smoke timeout budget failure; increasing that local smoke timeout from 15s to 30s resolved it.
- `bun test --timeout 60000 --max-concurrency 1 tests/hook-recursive-copy.test.ts`: pass (`1 pass`, migration smoke completed in 12.2s locally before the full gate rerun).
- `npm pack --dry-run --json`: pass. Dry-run package `repo-harness-0.7.5.tgz` includes `src/effects/repo-registry.ts`, `src/cli/mcp/reader-tools.ts`, `src/cli/mcp/session-store.ts`, `src/cli/mcp/version.ts`, and `src/cli/mcp/workspaces.ts`.
- `bun test --timeout 60000 --max-concurrency 1 tests/cli/mcp-workspaces.test.ts tests/cli/mcp-reader-tools.test.ts tests/cli/mcp-policy.test.ts`: 17 pass, 1 skip, 0 fail, 168 expects.
- `bun test --timeout 60000 --max-concurrency 1 tests/bootstrap-files.test.ts tests/cli/mcp-workspaces.test.ts tests/cli/mcp-reader-tools.test.ts tests/cli/mcp-policy.test.ts tests/cli/mcp-http.test.ts tests/cli/mcp-oauth.test.ts tests/cli/mcp-stdio.test.ts`: 39 pass, 1 skip, 0 fail, 629 expects.
- `bun test --timeout 60000 --max-concurrency 1 tests/cli/mcp-policy.test.ts tests/cli/mcp-tools.test.ts tests/cli/mcp-stdio.test.ts`: 24 pass, 0 fail, 194 expects.
- `bun test --timeout 60000 --max-concurrency 1 tests/cli/mcp-workspaces.test.ts tests/cli/mcp-reader-tools.test.ts tests/cli/mcp-stdio.test.ts tests/cli/mcp-oauth.test.ts tests/cli/mcp-http.test.ts tests/cli/mcp-tools.test.ts tests/cli/mcp-policy.test.ts tests/cli/mcp-setup.test.ts tests/cli/mcp.test.ts`: 55 pass, 0 fail, 563 expects.
- `bun test --timeout 60000 --max-concurrency 1 tests/cli/mcp-policy.test.ts tests/cli/mcp-reader-tools.test.ts tests/cli/mcp-tools.test.ts tests/cli/mcp-http.test.ts tests/cli/mcp-stdio.test.ts`: 33 pass, 0 fail, 308 expects. This rerun covers the policy fix that lets workspace reader read source/package files while legacy `read_workflow_file` still denies them.
- `bun test --timeout 60000 --max-concurrency 1 tests/cli/mcp-setup.test.ts`: 16 pass, 0 fail, 185 expects. This rerun covers generated ChatGPT setup guide behavior and `repo-harness-chatgpt-bridge` skill installation after release-note/migration-note synchronization.
- Local HTTP MCP transcript: passed. Artifact: `.ai/harness/handoff/mcp-reader-local-http-e2e.md`. It proves bearer auth, `initialize`, `tools/list`, `list_allowed_roots`, `open_workspace`, `tree`, Markdown/source/package/large-range `read_text`, `search_text`, denied `.env`/`secrets/**`/traversal, DELETE, and stale-session recovery.
- `bun run check:type`: pass.
- `git diff --check`: pass.
- `bash scripts/check-deploy-sql-order.sh`: pass.
- `bash scripts/check-architecture-sync.sh`: pass.
- `bash scripts/check-task-sync.sh`: pass.
- `bash scripts/check-task-workflow.sh --strict`: pass.
- `bun scripts/inspect-project-state.ts --repo . --format text`: no drift signals or required decisions.
- `bash scripts/migrate-project-template.sh --repo . --dry-run`: pass.
- `bun src/cli/index.ts mcp doctor --repo . --json`: `status=ready_local`; ChatGPT invocation verification remains `manual_required`.

## Hosted CI Readback

- `gh run list --branch codex/release-0.7.5 --limit 10`: latest CI runs for SHA `75b7a5047ec92836f7417448989af4af6a617737` are successful:
  - PR run `27894072154`, workflow `CI`, conclusion `success`, URL `https://github.com/Ancienttwo/repo-harness/actions/runs/27894072154`.
  - push run `27894071034`, workflow `CI`, conclusion `success`, URL `https://github.com/Ancienttwo/repo-harness/actions/runs/27894071034`.
- Boundary: those hosted runs predate the current local MCP reader diff and do not include the new `mcp-path-matrix` job from the uncommitted `.github/workflows/ci.yml` change. Current diff still needs hosted Ubuntu/macOS/Windows matrix readback after the branch is pushed.

## Final Exit Gate Audit

- Proven locally: registered adopted repo discovery, extra-root opt-in, legacy `fullDiskRead:true` fail-closed behavior, deny precedence, planner tool surface, bounded `tree`/`read_text`/`search_text`, source/package reads through workspace reader, legacy workflow read allowlist preservation, session-local workspaces, Session TTL/limit/DELETE, OAuth `offline_access`, refresh token rotation, server/package version consistency, planner/executor/orchestrator regression, local HTTP MCP transcript, local `check:ci`, and package dry-run/tarball install smoke.
- Sprint exit gate status is evidence-mapped in `plans/sprints/20260621-repo-harness-mcp-reader-hardening-sprint.md`; local implementation gates and local release-note/package-manifest evidence are checked, while version bump/release, hosted matrix, live ChatGPT, reviewer sign-off, and published smoke remain unchecked.
- Proven only for branch baseline: hosted CI success on `75b7a50`; it does not prove the current uncommitted MCP reader diff.
- Still open by design/user release hold: release/tag/publish/version bump, release checks, published-package smoke, reviewer sign-off, hosted path matrix readback for the current diff, and live ChatGPT Connector/App manual E2E.
- Blocker/resume artifact: `.ai/harness/handoff/mcp-reader-external-gates-blocker.md`.

## Reviewer Prep

- Local reviewer-prep artifact: `.ai/harness/handoff/mcp-reader-review-prep.md`.
- Formal reviewer intake artifact: `.ai/harness/handoff/mcp-reader-review-request.md`.
- Local self-review artifact: `.ai/harness/handoff/mcp-reader-self-review.md`.
- Scope: security/API/maintainer checklist evidence map, P1/P2/P3 trace, known external gaps.
- Boundary: this is not official reviewer sign-off; assigned reviewers still need to review the current diff.

## Manual ChatGPT E2E

- connector/app: pending
- public origin: pending
- schema hash: pending
- local HTTP transcript: passed, see `.ai/harness/handoff/mcp-reader-local-http-e2e.md`
- source/package read: covered by local HTTP transcript and automated tests, pending live ChatGPT readback
- OAuth refresh: covered by local tests, pending live ChatGPT readback
- Session reconnect: DELETE/stale-session covered by local HTTP transcript and tests, pending live ChatGPT readback
- denied path tests: covered by local HTTP transcript and tests, pending live ChatGPT readback
- large-file chunk test: covered by local HTTP transcript and tests, pending live ChatGPT readback
- search test: covered by local HTTP transcript and tests, pending live ChatGPT readback

## Known Limitations

- `mcp doctor` can report local readiness and manual evidence requirements, but it cannot prove ChatGPT tool invocation from the model surface.
- Windows junction behavior is represented by a Windows-only test and still needs a Windows runner.
- The sprint cannot be marked done until release, CI matrix, published smoke, reviewer sign-off, and manual ChatGPT E2E are complete.

## Rollback

- Security hotfix rollback must not reintroduce deny bypass in broad-read compatibility.
- Reader capability rollback can remove reader tools and workspace manager while preserving workflow MCP tools.
- OAuth/session rollback should preserve bearer compatibility only as a fallback and must keep public-origin fail-closed behavior.

## Follow-up Tasks

- Run manual ChatGPT Connector E2E through a stable HTTPS endpoint and capture sanitized tool-call evidence.
- Run Linux and Windows path matrix, including the Windows junction test.
- Run release checks, publish, and published-package smoke only after the release hold is lifted.
