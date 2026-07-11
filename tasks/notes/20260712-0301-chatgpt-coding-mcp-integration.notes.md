# Implementation Notes: chatgpt-coding-mcp-integration

> **Status**: Active
> **Plan**: plans/plan-20260712-0301-chatgpt-coding-mcp-integration.md
> **Contract**: tasks/contracts/20260712-0301-chatgpt-coding-mcp-integration.contract.md
> **Review**: tasks/reviews/20260712-0301-chatgpt-coding-mcp-integration.review.md
> **Last Updated**: 2026-07-12 04:49
> **Lifecycle**: notes

## Design Decisions

- Created `codex/chatgpt-coding-mcp-integration` from `origin/main@788ba60` and replayed only `0b80ef4`, `47cbe50`, `2f3405d`, `443f3ea`, `2a9d490`, `c3a77d1`, and `f3b546d`. A branch-tree merge was rejected because the feature base predates the rollout-retirement cutover and would resurrect deleted base files that none of the seven commits actually changed.
- Preserved current mainline removal of `McpPolicy.generalRepo`, rollout flags, environment rollout reads, and workflow-reader fallbacks. Coding remains a first-class `coding` profile with `workspaceCoder`, `codingShell`, five direct tools, explicit registry grant authority, and OAuth authorization-scoped runtime ownership.
- Resolved generated `tasks/current.md` and `tasks/todos.md` conflicts to the integration side and deferred final `tasks/current.md` regeneration until after verification; neither stale branch snapshot is authoritative.
- Kept `package.json`'s current Bun floor `>=1.1.35` and added only the accepted optional `node-pty@^1.1.0`; `bun install --frozen-lockfile` passed.
- A read-only conflict explorer independently checked the 12 overlapping origin/feature paths and found no architecture blocker, with the same hard invariant: preserve rollout retirement and add coding without a second repo-access authority.
- The required Claude external review timed out twice while using repository read tools on the complete 7k-line diff; neither run produced stdout or a recoverable assistant transcript, so neither was counted as acceptance. A stricter no-tools run reviewed the same complete embedded diff and returned four P1 and four P2 findings.
- Two Claude findings were actionable within the accepted integration boundary: move rollback lacked a dedicated mid-commit fault regression, and interval-driven authorization-runtime cleanup could surface an unhandled rejected shutdown. Added the move-specific rollback assertion plus an injected cleanup-rejection/race-idempotency test, and now catch background cleanup failures with a sanitized error name.
- The two non-coding CORS/Host findings describe unchanged planner/executor/orchestrator behavior from current main. The approved plan explicitly preserves those profiles and hardens only the default-off `coding` profile, so they are not integration regressions and remain outside this merge unit.
- The Windows `taskkill` finding is retained as a cross-platform coverage advisory: the existing Windows MCP path matrix does not execute the POSIX-command-heavy process-session suite, and a faithful Windows termination test requires a separate injectable process-control boundary. This integration does not claim that additional platform refactor.
- Claude's remaining advisories are retained for review: mixed Ctrl-C/input semantics, repeated live-doctor DCR client retention, and lifecycle concurrency. The cleanup race now has a direct regression and idempotent runtime shutdown already uses the existing `closedCodingRuntimes` guard.

## Deviations From Plan Or Spec

- The first post-replay typecheck found one mechanical conflict-resolution omission: `src/cli/mcp/server.ts` used `McpPolicy` in the new coding runtime builder without importing the type. Added the missing type-only import; no runtime behavior changed.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Merge the feature branch tree | Reject | Would restore files and stale policy state deleted after the feature branch fork. |
| Replay the seven feature commits | Use | Applies only reviewed coding changes and exposes semantic conflicts against current authority. |
| Choose feature side for overlapping MCP files | Reject | Feature-side snapshots still contained retired rollout/generalRepo structures. |
| Preserve origin authority and layer coding fields/tools | Use | Maintains one repo-access authority while retaining the accepted coding contract. |

## Open Questions

- None.

## Verification Evidence

- Contract brief preflight passed before replay.
- `bun install --frozen-lockfile` passed with the merged Bun engine and optional PTY dependency.
- Focused authority suite passed 97 tests / 1119 expectations across policy, setup, reader, stdio, base MCP tools, coding, process, HTTP, and OAuth files.
- `bun run check:type` passed after the type-only import correction.
- After Claude review remediation, `bun run check:type` and the focused coding/HTTP pair passed 12 tests / 143 expectations with zero failures.
- Full `bun test` passed with 1158 tests, 1 platform-specific skip, 0 failures, and 11695 expectations across 99 files.
- The first strict contract-verifier pass reported only its encapsulated `bun test` command as failed while all other 22 criteria passed; that verifier discards the child log, so the exact transient test was not recoverable. An immediate foreground full-suite reproduction passed with the same 1158/1/0/11695 result, and a second unchanged strict verifier run passed all 23 criteria and set the contract to `Fulfilled`. This transient is retained as evidence rather than being silently dropped.
- Later `verify-sprint` attempts repeated the same encapsulated full-suite-only failure while other worktrees were also running full contract suites and a pre-existing host process continued consuming roughly one CPU. The exact root `bun test` had already passed repeatedly, including with verifier-equivalent non-login shell and file redirection. The machine contract now uses the repository CI envelope (`BUN_TEST_MAX_CONCURRENCY=1`, `BUN_TEST_TIMEOUT_MS=180000`, `BUN_TEST_ISOLATE_FILES=1`) for deterministic re-verification under shared-host pressure; this runs the same complete suite and does not replace the recorded raw `bun test` passes.
- Root required checks passed: frozen install, typecheck, deploy SQL ordering, architecture sync, task sync, project inspection, self-migration dry-run, and `git diff --check`.
- Strict workflow passed against an isolated copy of the shared brain vault after projecting this branch's repo-authored docs there. The default shared vault was not mutated because another active worktree owns its current drift.
- `scripts/mcp-rollout-gate.ts` and `tests/mcp-rollout-gate.test.ts` remain absent; stale rollout flag strings exist only in the setup migration fixture that proves removal.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
