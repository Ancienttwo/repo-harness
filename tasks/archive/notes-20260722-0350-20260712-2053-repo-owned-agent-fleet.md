# Implementation Notes: repo-owned-agent-fleet

> **Status**: Active
> **Plan**: plans/plan-20260712-2053-repo-owned-agent-fleet.md
> **Contract**: tasks/contracts/20260712-2053-repo-owned-agent-fleet.contract.md
> **Review**: tasks/reviews/20260712-2053-repo-owned-agent-fleet.review.md
> **Last Updated**: 2026-07-12 21:22
> **Lifecycle**: notes

## Design Decisions

- `agents/fleet/*.md` is the only authored role source because `agents/` is already an explicit npm package surface.
- `.claude/agents/*.md` and `.codex/agents/*.toml` remain repo-local deterministic projections/goldens, not package authority.
- `external_tooling.agent_fleet` replaces `external_tooling.fable_agents` in one cutover; no alias, fallback reader, or migration shim remains.
- Source resolution is based on `REPO_HARNESS_HELPER_SOURCE_PATH`, never target-repo cwd.
- The accepted model map contains only `opus -> gpt-5.6-sol` and `sonnet|haiku -> gpt-5.6-luna`; the retired `fable` model alias was removed with the source dependency so it cannot survive as compatibility behavior.

## Deviations From Plan Or Spec

- The independent review found one stale deferred-ledger count (`three` Codex TOMLs). It was corrected to `four`; the reviewer rechecked the fix and returned PASS.
- The contract's executable gate keeps the four directly affected test files but does not redundantly invoke the 374-second full suite or unrelated `helper-scripts` suite inside `verify-contract`; the packaged helper wrapper has a 120-second whole-command ceiling. The full suite was run separately and its 1141-pass result is recorded in the review.
- The affected tests run through `commands_succeed` with `REPO_HARNESS_HELPER_SOURCE_PATH` explicitly unset. `repo-harness run verify-contract` exports the verifier helper's own package path; inheriting that unrelated helper path would intentionally make the fleet source-layout tests fail. Only the verifier-supported evaluator recommendation remains under `manual_checks`; the other human evidence stays in the review card.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| `agents/fleet/` package source | Chosen | Already published, direct package ownership, no new package manifest surface. |
| `.claude/agents/` source | Rejected | Dot-directory is not included in the npm package. |
| `assets/agent-fleet/` source | Rejected | Publishable but adds a new subtree when the existing `agents/` surface already owns agent assets. |
| Remote Fable source or fallback | Rejected | Recreates the failed dual/network authority and contradicts the user-approved cutover. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Focused fleet/tooling/bootstrap/runtime suite: 58 pass, 0 fail.
- Package dry run: all four `agents/fleet/*.md` files are present in the npm payload.
- Source-layout and packaged-layout temporary-HOME smokes: eight generated targets in each layout.
- Independent read-only review: PASS after the single deferred-ledger count correction; no runtime, scope, or package-authority blocker remains.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
