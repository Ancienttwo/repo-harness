# Implementation Notes: r1-provider-neutral-agent-runtime

> **Status**: Active
> **Plan**: plans/plan-20260830-1903-r1-provider-neutral-agent-runtime.md
> **Contract**: tasks/contracts/20260830-1903-r1-provider-neutral-agent-runtime.contract.md
> **Review**: tasks/reviews/20260830-1903-r1-provider-neutral-agent-runtime.review.md
> **Last Updated**: 2026-08-30 22:35
> **Lifecycle**: notes

## Design Decisions

- Task Inbox has no delivery receipt before the first delivery attempt. That absence is the canonical `pending` state; the Agent Runtime effect freezes delivery attempt `1` and never synthesizes a receipt.
- Task IDs and task revisions use the repository's existing raw 64-hex authority shape. The plan's `sha256` shorthand describes content identity, not a wire-format prefix.
- `EngineerBindingV1.provider_thread_id` remains the historical opaque endpoint locator. Under `tmux-cli-agent` it is only a Host resolver token and is never accepted as a caller-selected raw tmux target.
- Positive completion is owned exclusively by an exact persisted Task/Module delivery receipt. Process exit, pane content, adapter stdout/stderr and elapsed time cannot produce `observed_success`.
- A V1 migration crash after archive rename recovers only when exactly one digest-named archive exists and its tree digest proves the expected source. Missing or ambiguous archives fail closed.
- The final fixed-point architecture apply, after archiving the handled adapter-path request, produced receipt `sha256:6d1d03493a689cbc3eac9182d182252536b2d4e0f586538e53d28db7ce40590b` with no human actions.

## Deviations From Plan Or Spec

- The real tmux canary ran against a temporary already-bound local session and passed. A real Codex App Thread canary remains unavailable because no user-owned target task was explicitly authorized; the adapter is covered by an injected Host invoker test only.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Invoke adapters inside `engineer runtime-effect start` | Reject | The command owns persist-first admission and returns one closed Host action; automatic execution would merge endpoint resolver authority into the journal boundary. |
| Retry after an unknown tmux/Codex outcome | Reject | At-most-once action admission is the safety invariant; ambiguity becomes `reconciliation_required`. |
| Parse tmux pane output as acknowledgement | Reject | Pane text is untrusted runtime output and cannot compete with Inbox receipt authority. |

## Open Questions

- Closeout requires one explicitly authorized real Codex App Thread target for the remaining Host-control canary.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
