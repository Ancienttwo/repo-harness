# Implementation Notes: architecture-agent-guidance

> **Status**: Active
> **Plan**: plans/plan-20260913-1843-architecture-agent-guidance.md
> **Contract**: tasks/contracts/20260913-1843-architecture-agent-guidance.contract.md
> **Review**: tasks/reviews/20260913-1843-architecture-agent-guidance.review.md
> **Last Updated**: 2026-09-13 18:43
> **Lifecycle**: notes

## Design Decisions

- Reuse SessionStart and canonical capability matching. Only tracked package manifest paths are inventory evidence; the Agent owns semantic boundaries. No new dependency, source file, configuration surface or queue.

## Deviations From Plan Or Spec

- Change Assessment routes the complete subject under the existing strict auth category; declare the existing session-context and required-integrity oracle for this complete slice. No verification command or authority is bypassed.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Automatic directory-to-node generation | Rejected | Directory names do not establish architecture ownership. |
| Existing public archctx plan/apply | Selected for new nodes | ChangeSet validates authority and worktree digest; existing node updates require a supported typed surface. |

## Recovery decision and corrected trace

- User approved the bounded task-sync recovery extension. P1: the helper owns diff binding; state resolve owns the profile and intentionally suppresses field output on blockers. P2: a contract commit changes the diff base, invalidating the older note digest; the helper checks exact evidence before profile resolution, but on resolution failure hides the current digest. P3: preserve the existing exact-binding path and failed profile exit; print the binding needed for recovery. No state cache deletion, acceptance relaxation or new profile parser.
- The prior report of an unavoidable verification cycle was incomplete: exact bound evidence already succeeds without querying state. The missing failure diagnostic prevented discovering the required new binding.
- New source file/dependency/abstraction: none. The pre-fix log is required regression evidence; helper projection is deterministic output of scripts/check-task-sync.sh.

## Open Questions

- No implementation blocker remains. This worktree is not merged or published.

## Evidence Links

- Canonical run: `.ai/harness/runs/run-20260913T185755-62955-20260913-1843-architecture-agent-guidance.json`: 21 checks pass, including 55 session-context tests and 34 task-sync tests. Required integrity and Change Assessment pass.
- Pre-fix guard: `.ai/harness/failures/task-sync-recovery-pre-fix.log` records failure before recovery diagnostics existed.
- Codex plugin: approve, no findings, exact subject `sha256:c2a867557893572521d60277b0e90155cd5f10a04c868fb5d83f62b01fdb7b7c`, pinned base `f1596f094423018e35ceb6f46f74a8d07b7b182c`. Reviewer inspected without rerunning tests.
- Checks: `.ai/harness/checks/latest.json`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

> **Substantive Change SHA256**: `sha256:7f57ff15791431e4201ce8126d5e792b4bff88ca25ff34ebcd8010696be0ae46`
