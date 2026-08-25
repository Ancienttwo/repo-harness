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
- `check-task-sync` ignores only `docs/architecture/.projection-manifest.json`, matching `verify-sprint`'s existing workflow-owned publication rule. This prevents the acceptance-time digest restamp from demanding a fabricated task narrative while sibling architecture documents remain substantive and gated.
- The official provider runs against a private temporary Git clone pinned to the captured HEAD, with the captured final content overlaid and re-fingerprinted before invocation. The source subject is re-fingerprinted after the process exits; source drift is blocking `stale_scope` and never triggers a second semantic review.
- Official output is accepted only when `approve` has no findings or `needs-attention` has at least one finding. Init, runtime discovery, and tooling readiness now all require the contained companion, matching OpenAI manifest/version, and supported review schema.

## Deviations From Plan Or Spec

- The single live official-plugin review of subject `sha256:a37fea8a05e598e302091b7b19e5e41ae4bf91f47b1be5d33fbe7819e6d57c94` returned two P1 findings and one P2 finding instead of a pass. All three were repaired locally: verdict/findings inconsistency now fails closed, the provider reviews an immutable pinned snapshot and rejects source drift, and setup/readiness validates the full install. The one-review circuit breaker forbids a second semantic review of the repaired subject; acceptance therefore requires an explicit policy-authorized human waiver rather than fabricated external-pass attribution.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Nested `claude -p /codex:review` | Rejected | Headless Claude exited before the plugin background job completed in a live temporary-repository proof. |
| Direct `codex exec` on Codex host | Rejected | It bypasses the official plugin integration the user explicitly selected and cannot truthfully produce `source=codex-plugin`. |
| Official companion runtime | Selected | It is the plugin-owned app-server execution path and returns machine-readable structured findings. |
| Claude fallback when plugin fails | Rejected | It changes reviewer identity and would make receipt attribution untrustworthy. |
| Live-tree review with only a post-run hash check | Rejected | It cannot prove which bytes were inspected if content changes and changes back during a long review. |
| Immutable temporary Git snapshot | Selected | It pins committed and dirty final content while preserving the plugin's normal repository/app-server path; the source is rechecked before returning. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Local official plugin inspected: `codex@openai-codex` 1.0.6.
- Projection/task-sync regression: `tests/check-task-sync.test.ts` proves the exact manifest exemption and rejects sibling architecture-doc changes without task synchronization.
- Live proof root: `/private/tmp/repo-harness-codex-plugin-proof-20260825` (temporary, non-durable evidence).
- Official review thread: `01a037d2-c4f5-7e60-a071-ee9c41650dc5`; findings are covered by regression tests in `tests/cli/cross-review.test.ts`, `tests/cli/init.test.ts`, and `tests/check-agent-tooling.test.ts`.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
