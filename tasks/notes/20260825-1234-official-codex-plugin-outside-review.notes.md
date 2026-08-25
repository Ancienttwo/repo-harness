# Implementation Notes: official-codex-plugin-outside-review

> **Status**: Active
> **Plan**: plans/plan-20260825-1234-official-codex-plugin-outside-review.md
> **Contract**: tasks/contracts/20260825-1234-official-codex-plugin-outside-review.contract.md
> **Review**: tasks/reviews/20260825-1234-official-codex-plugin-outside-review.review.md
> **Last Updated**: 2026-08-25 12:34
> **Lifecycle**: notes

## Design Decisions

- Codex-host review uses the official plugin's `codex-companion.mjs adversarial-review --json` runtime directly after discovery through `claude plugin list --json`. Nested `claude -p /codex:review --wait` is not used because a live proof returned before the background review completed.
- The app-server request is pinned to the captured base SHA and explicitly names branch, staged, unstaged, and untracked scope. Native `/codex:review` scope selection alone is insufficient because it chooses either branch or working tree, not their union.
- Official severities are translated at the provider boundary: `critical|high -> P1`, `medium|low -> P2`. The existing CrossReviewResult remains the internal contract.
- New acceptance-policy protocol 2 freezes both reviewer and source. Protocol 1 remains readable solely for historical receipts; it does not select an active Claude provider.
- Review Gate remains disabled. Setup installs/enables only the official plugin capability required by explicit outside-review invocation.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Nested `claude -p /codex:review` | Rejected | Headless Claude exited before the plugin background job completed in a live temporary-repository proof. |
| Direct `codex exec` on Codex host | Rejected | It bypasses the official plugin integration the user explicitly selected and cannot truthfully produce `source=codex-plugin`. |
| Official companion runtime | Selected | It is the plugin-owned app-server execution path and returns machine-readable structured findings. |
| Claude fallback when plugin fails | Rejected | It changes reviewer identity and would make receipt attribution untrustworthy. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Local official plugin inspected: `codex@openai-codex` 1.0.6.
- Live proof root: `/private/tmp/repo-harness-codex-plugin-proof-20260825` (temporary, non-durable evidence).

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
