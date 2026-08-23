> **Archived**: 2026-08-23 13:07
> **Related Plan**: plans/archive/plan-20260823-0454-task-inbox-v1.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260823-1307

# Implementation Notes: task-inbox-v1

> **Status**: Active
> **Plan**: plans/plan-20260823-0454-task-inbox-v1.md
> **Contract**: tasks/contracts/20260823-0454-task-inbox-v1.contract.md
> **Review**: tasks/reviews/20260823-0454-task-inbox-v1.review.md
> **Last Updated**: 2026-08-23 04:55
> **Lifecycle**: notes

## Design Decisions

- Use a new typed `UserPromptSubmit.inbox` route on both hosts. `SessionStart` is not every real turn, `SubagentStart` is Codex-child-specific, and coupling inbox bodies to `prompt-handler.ts` would let peer content affect prompt classification.
- Resolve owner delivery from the worktree-local active-plan claim token, then revalidate canonical task revision, current bound lease, claim/generation, and execution worktree under the task lock. `EffectiveState.task_id` is a plan artifact stem and is not canonical task identity.
- Persist a recipient receipt as `delivered` before returning hook context. This gives at-most-once injection; a host crash after the receipt write can lose one display, but retrying cannot duplicate untrusted content or create session authority.
- Do not add MCP in WP3-A because the current MCP transport proves repo authorization but exposes no trustworthy user/orchestrator recipient principal.

## Deviations From Plan Or Spec

- Full-suite integration widened the exact path set to the existing route-count,
  LoopEvent total-map, installer-profile, runtime-characterization, doctor, and
  hook-diet acceptance surfaces. The hook-diet ceiling gained one explicit Task
  Inbox allowance (12 total); the original 8 core-route and 3 Codex lifecycle
  budgets remain unchanged.
- Independent gate review found that manual `user`/`orchestrator` recipients
  could list bodies but had no persisted delivery transition, so acknowledgement
  was unreachable. `fleet inbox list` now acts as the controlled manual
  delivery boundary before returning the projection; owner, user, and
  orchestrator paths all preserve lease bytes. The handler/effect boundary also
  uses the concrete TypeScript contract without an erasing cast.
- Gate follow-up rejected caller-selected `--recipient-id` as a durable
  principal. The CLI now exposes only the current bound owner, derived from the
  lease and execution worktree. The effect retains typed manual recipient
  support for a future authenticated transport, but no current command can
  mint or acknowledge another user/orchestrator's receipt.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Independent hook route vs prompt-handler extension | Independent route | Keeps peer data outside prompt-routing semantics and gives Codex an explicit structured-output route. |
| SessionStart delivery | Reject | Does not deliver on an already-running worker's next real turn. |
| MCP mirror | Defer | Caller-selected recipient identity would violate the transport-derived recipient fence. |
| Secret/transcript regex scan | Reject | Cannot prove semantic absence; structurally forbid transcript reads, bound bytes, and render all bodies as untrusted. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Focused acceptance: 166 tests across 16 protocol, store, hook, installer,
  route-map, profile, and CLI files passed under Bun 1.4.0; `bun run
  check:type` passed before the full-suite run.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
