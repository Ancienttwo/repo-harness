# Task Review: repo-harness-0-10-0-release-blockers

> **Status**: Complete
> **Plan**: plans/plan-20260714-2318-repo-harness-0-10-0-release-blockers.md
> **Contract**: tasks/contracts/20260714-2318-repo-harness-0-10-0-release-blockers.contract.md
> **Notes File**: tasks/notes/20260714-2318-repo-harness-0-10-0-release-blockers.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-15 02:16
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:2242afc51e3dbbe9b05863ba5c0fdff79f241110687e6d7d08ecd1e618990113
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 26acdb7b79b93c3c6442360cd72351ec3e071601

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: release-blocker implementation, focused tests, package metadata, architecture/reference docs, release filing, and linked workflow artifacts listed by the contract.
- Actual files changed: matches the contract after adding `tests/cli/status.test.ts` for the full-gate fixture correction; no `_ops`, external worktree, npm registry, tag, or release mutation.
- Commands passed: focused 133-test suite; targeted install/status 37-test suite; registry transaction 12-test suite; typecheck; `git diff --check`; deploy SQL, architecture, task, and strict workflow checks; project inspection; adoption dry-run; full `bun run check:release`, including package dry-run and installed tarball smoke.
- Residual risks: one tunnel socket shares an OAuth limiter identity; unauthenticated DCR can fill the fixed 64-client/30-day capacity. Both are bounded availability risks without an authorization bypass.
- Reviewer action required: none for source merge; npm publish/tag/GitHub Release still require separate authorization.
- Rollback: revert the release-blocker commit before publication; after publication, ship a patch release.

## Mode Evidence

- Selected route: `$check` strict bugfix review with user-directed Claude-review skip and independent Codex security plus architecture specialists.
- P1/P2/P3 evidence: install-profile authority, packaged docs, MCP setup/registry authorization, HTTP/OAuth state, process sessions, and distribution surfaces are mapped in the plan and architecture modules; concrete pre-fix traces are preserved in `.ai/harness/runs/20260714-0.10.0-release-blockers-pre-fix.log`.
- Root cause or plan evidence: update defaulted away from persisted profile; legacy ownership accepted unsafe paths/history; setup mutated grants before all validation; OAuth state was unbounded/spoofable; the Bun PTY contract was unreachable; root Skill references were absent from the archive.

## Verification Evidence

- Waza `/check` run: completed locally; Claude review skipped by explicit user direction.
- Commands run: `bun run check:type`; focused Bun tests; `git diff --check`; `bash scripts/check-deploy-sql-order.sh`; `bash scripts/check-architecture-sync.sh`; `bash scripts/check-task-sync.sh`; local-source `check-task-workflow --strict`; project inspection; adoption dry-run; `bun run check:release`; npm registry and pack dry-run readbacks.
- Manual checks: security specialist injected registry rename failure after prepared config and proved config restore, unchanged grants/revision, and stale-revision denial; architecture specialist reproduced then verified closure of legacy `previous` validation; PTY/dependency references were inspected after removal.
- Supporting artifacts: pre-fix regression log, release filing, architecture module updates, specialist findings in the current task.
- Implementation notes reviewed: yes.
- Run snapshot: final release gate ended `[ci] OK` and `[release] OK`; tarball smoke confirmed installed package CLI bins start.

## External Acceptance Advice

> **External Acceptance**: unavailable
> **External Reviewer**: Claude
> **External Source**: owner-directed skip in the branch consolidation task
> **External Started**: 2026-07-15T01:00:00+0800
> **External Completed**: 2026-07-15T02:16:00+0800
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:2242afc51e3dbbe9b05863ba5c0fdff79f241110687e6d7d08ecd1e618990113
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 26acdb7b79b93c3c6442360cd72351ec3e071601
> **Benchmark Evidence SHA256**: not-applicable

- P1 blockers: none in local `/check`, security specialist, or architecture specialist review.
- P2 advisories: tunnel-wide limiter sharing and bounded public DCR capacity are accepted availability residuals recorded in notes and the release filing.
- Acceptance checklist: owner-directed Claude skip is recorded without claiming canonical external PASS; source diff, failure injection, focused tests, full release gate, package contents, and tarball install are locally verified.

## Behavior Diff Notes

- `update` preserves the installed profile and rejects conflicting profile/component/ownership history before mutation.
- Coding setup preflights all grants, prepares revision-bound config, and activates grants with one atomic registry commit; failure restores prior config.
- OAuth request/client state is bounded and fail closed; direct socket identity replaces spoofable forwarded headers.
- Coding process sessions are pipe-only under Bun; the unreachable PTY schema/runtime/dependency is removed.
- Packaged Skill guidance resolves through bundled docs and is exercised from the installed tarball.

## Residual Risks / Follow-ups

- Tunnel-wide rate identity and fixed DCR admission capacity remain explicit availability tradeoffs until a separately approved trusted-proxy or registration-admission contract exists.
- npm `0.10.0`, tag `v0.10.0`, GitHub Release, published-package readback, and PATH-visible public install proof remain pending separate release authorization.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 10/10 | Confirmed blockers have regression coverage and the full release gate passes. |
| Product depth | 9/10 | Source, package, docs, security boundaries, and workflow artifacts close together. |
| Design quality | 9/10 | Existing authorities are preserved; no compatibility fallback or dual authority added. |
| Code quality | 9/10 | Focused failure injection, typecheck, full suite, package dry-run, and tarball smoke pass. |

## Failing Items

- none for source merge.

## Retest Steps

- Re-run: `BUN_TEST_MAX_CONCURRENCY=4 BUN_TEST_TIMEOUT_MS=180000 BUN_TEST_ISOLATE_FILES=1 bun run check:release`.
- Re-check: after explicit publish authorization, run the release filing checklist against the exact merged commit.

## Summary

- All confirmed `0.10.0` source release blockers are closed. Local `/check`, security, architecture, full release, package, and installed-tarball evidence recommend source merge; external publication remains deliberately unexecuted.
