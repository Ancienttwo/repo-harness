# Implementation Notes: chatgpt-coding-mcp-integration

> **Status**: Active
> **Plan**: plans/plan-20260712-0301-chatgpt-coding-mcp-integration.md
> **Contract**: tasks/contracts/20260712-0301-chatgpt-coding-mcp-integration.contract.md
> **Review**: tasks/reviews/20260712-0301-chatgpt-coding-mcp-integration.review.md
> **Last Updated**: 2026-07-12 03:07
> **Lifecycle**: notes

## Design Decisions

- Created `codex/chatgpt-coding-mcp-integration` from `origin/main@788ba60` and replayed only `0b80ef4`, `47cbe50`, `2f3405d`, `443f3ea`, `2a9d490`, `c3a77d1`, and `f3b546d`. A branch-tree merge was rejected because the feature base predates the rollout-retirement cutover and would resurrect deleted base files that none of the seven commits actually changed.
- Preserved current mainline removal of `McpPolicy.generalRepo`, rollout flags, environment rollout reads, and workflow-reader fallbacks. Coding remains a first-class `coding` profile with `workspaceCoder`, `codingShell`, five direct tools, explicit registry grant authority, and OAuth authorization-scoped runtime ownership.
- Resolved generated `tasks/current.md` and `tasks/todos.md` conflicts to the integration side and deferred final `tasks/current.md` regeneration until after verification; neither stale branch snapshot is authoritative.
- Kept `package.json`'s current Bun floor `>=1.1.35` and added only the accepted optional `node-pty@^1.1.0`; `bun install --frozen-lockfile` passed.
- A read-only conflict explorer independently checked the 12 overlapping origin/feature paths and found no architecture blocker, with the same hard invariant: preserve rollout retirement and add coding without a second repo-access authority.

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
