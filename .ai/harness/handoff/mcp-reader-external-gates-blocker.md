# MCP Reader External Gates Blocker

task_id: RH-MCP-205
date: 2026-06-21T23:21:24+0800
owner: release owner / reviewer
severity: high
blocked_since: 2026-06-21T23:21:24+0800
status: local implementation evidence complete, external gates pending

## Symptom

The MCP reader sprint cannot be marked `done` from the current local session.

Local implementation, documentation, self-review, local HTTP transcript, full non-release CI, package dry-run, and local tarball smoke are complete. Remaining sprint exit gates require external or explicitly paused actions:

- current-diff hosted Ubuntu/macOS/Windows `mcp-path-matrix` readback
- live ChatGPT Connector/App schema rescan and real tool-call transcript
- assigned reviewer sign-off for security/API/maintainer scope
- release/version/tag/publish checks and published package smoke

## Reproduction

Current branch and commit:

```text
branch: codex/release-0.7.5
HEAD: 75b7a5047ec92836f7417448989af4af6a617737
worktree: dirty, mixed staged/unstaged/untracked
```

Hosted CI readback:

```text
gh run list --branch codex/release-0.7.5 --limit 10 --json databaseId,workflowName,headSha,status,conclusion,event,createdAt,url
```

Latest hosted runs are successful but are for `75b7a5047ec92836f7417448989af4af6a617737`, which predates the current MCP reader diff and does not prove the new `mcp-path-matrix` job in the uncommitted workflow change.

Local non-release evidence:

```text
BUN_TEST_MAX_CONCURRENCY=1 bun run check:ci
result: pass
tests: 905 pass, 1 skip, 0 fail, 9055 expects
extra gates: workflow checks, repository inspection, package dry-run, tarball smoke passed
```

## Expected

Sprint can be marked done only after:

1. current diff is pushed or otherwise made available to hosted CI
2. hosted Linux/macOS/Windows matrix completes
3. live ChatGPT Connector/App tool invocation is captured and sanitized
4. assigned reviewer signs off threat model, API/MCP surface, and maintainer scope
5. release checks, publish, and published-package smoke pass after the release hold is lifted

## Actual

The current session is intentionally not running release/tag/publish/version bump/release checks and is not staging/committing/pushing because the user has parallel updates in flight.

Therefore the sprint remains partial:

- local implementation gates: proven
- local non-release CI/package gates: proven
- current-diff hosted matrix: missing
- live ChatGPT E2E: missing
- formal reviewer sign-off: missing
- release/published smoke: missing

## Security Impact

No new local security blocker is known. The unresolved risk is evidence risk: without hosted matrix, live Connector invocation, and reviewer sign-off, the project cannot claim the hardened MCP reader behavior is externally verified for the release target.

## Options Considered

- Mark sprint done from local evidence only: rejected because sprint exit gate explicitly requires hosted matrix, live ChatGPT E2E, reviewer sign-off, and published smoke.
- Run release checks now: rejected by user instruction to avoid release work while parallel updates are still in flight.
- Push current mixed worktree for hosted matrix: rejected because the worktree contains parallel dirty files and no staging/commit/push was requested.
- Record blocker and exact resume path: chosen.

## Recommended Decision

After the parallel updates are reconciled, create a stable diff basis and run the external gates in this order:

1. Isolate or stage only the intended MCP reader scope.
2. Run local smoke if the diff changed after this blocker:

   ```bash
   BUN_TEST_MAX_CONCURRENCY=1 bun run check:ci
   ```

3. Push the review branch and read back hosted CI, including `mcp-path-matrix`.
4. Run live ChatGPT Connector/App E2E through a stable HTTPS `/mcp` endpoint and archive sanitized evidence.
5. Get assigned reviewer sign-off using `.ai/harness/handoff/mcp-reader-review-request.md`.
6. Only after the release hold is lifted, run release checks, publish, and published-package smoke.

## Required Owner

- Release owner: versioning, release checks, publish, published smoke.
- Reviewer: security/API/maintainer sign-off.
- Operator with ChatGPT Developer Mode access: live Connector/App E2E.

## Resume Command/Checklist

Read first:

```bash
sed -n '1650,2145p' plans/sprints/20260621-repo-harness-mcp-reader-hardening-sprint.md
sed -n '1,180p' .ai/harness/handoff/mcp-reader-sprint-closeout.md
sed -n '1,180p' .ai/harness/handoff/mcp-reader-review-request.md
```

Then verify current state:

```bash
git status --short --branch
gh run list --branch codex/release-0.7.5 --limit 10 --json databaseId,workflowName,headSha,status,conclusion,event,createdAt,url
```

Do not mark RH-MCP-205 or the final sprint exit gate complete until the missing external gates are backed by current evidence.
