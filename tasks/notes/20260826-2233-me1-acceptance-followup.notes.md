# Implementation Notes: me1-acceptance-followup

> **Status**: Active
> **Plan**: plans/plan-20260826-2233-me1-acceptance-followup.md
> **Contract**: tasks/contracts/20260826-2233-me1-acceptance-followup.contract.md
> **Review**: tasks/reviews/20260826-2233-me1-acceptance-followup.review.md
> **Last Updated**: 2026-08-26 22:33
> **Lifecycle**: notes

## Design Decisions

- **ME-1B first-read convergence gates on the Profile authority, not on the aggregated component row.** `collectEngineeringBoard` now projects `engineers: []` unless `before.profiles` *and* `after.profiles` are both `available` (`src/effects/engineers/engineering-overlay.ts:266-274`). The Profile authority names the projection's rows, so a pass that lost it observed no Engineers at all; letting the surviving pass repopulate the roster is what made the two read directions disagree and violated the core invariant `unreadable profiles require an empty fully degraded projection` (`src/core/engineers/engineering-overlay.ts:320-323`). Reading the gate off `before/after` directly rather than off the already-computed `components` row keeps the authority relationship explicit instead of round-tripping through a derived projection.
- **ME-1C evaluates the assignment fence before the terminal-state check.** In `receiveModuleInbox` the stale-fence branch now runs first and admits `pending` and `delivered` (`src/effects/engineers/module-inbox.ts:668-681`). `acknowledged` and `superseded` keep the early return, which matches `supersedeModuleMessageReceipt` already accepting exactly `pending|delivered` (`src/core/engineers/module-message.ts:490-501`); no core change was needed. Ordering the fence first — rather than adding `delivered` to a second branch after the early return — keeps one place that decides "this receipt is addressed to a fence the principal cannot acknowledge".
- **`sprint graph` reuses the `engineer.ts` three-way whitelist verbatim** (`src/cli/commands/sprint.ts:33-44`): domain classes expose `.code`, a local `CliArgumentError` maps to `invalid_argument`, everything else is `internal_error`. Two domain classes are reachable on this path, so both are whitelisted: `EngineerSchedulingError` and `RepoHarnessRegistryStrictError`. The other `sprint` subcommands already route through `writeOutcome` and were left alone.

## Deviations From Plan Or Spec

- None.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| ME-1B: gate `engineers` on the derived `components` row vs. on `before/after` profile reads | Gate on `before.profiles`/`after.profiles` | Same result, but states the authority relationship at the point of use instead of re-reading a projection that was just derived from it |
| ME-1C: add `delivered` to a second supersede branch after the early return vs. hoist the fence above it | Hoist the fence | One decision site for "addressed to a fence this principal cannot acknowledge"; a second branch would have duplicated the three-field comparison |
| `sprint graph`: whitelist only `EngineerSchedulingError` vs. also `RepoHarnessRegistryStrictError` | Whitelist both | `readRepoHarnessRegistryStrictSnapshot` is called directly in this action and its `fleet_registry_invalid`/`fleet_registry_unavailable` codes are the machine signal a caller needs; flattening them to `internal_error` would have moved the bug rather than fixed it |

## Open Questions

- **Sibling of the ME-1B defect, deliberately left unfixed (out of contract scope).** The same before/after asymmetry exists one level down: if `bindings`, `claims`, `messages`, or `provider_effects` is unreadable in only *one* pass while profiles stay readable, `components[c].support` is `unreadable` (intersection of both passes) while the per-Engineer projection comes from `after` alone and reports `available`, which trips `${component} component support does not match Engineer observations` (`src/core/engineers/engineering-overlay.ts:325-336`). The profile-level fix does not cover it, and covering it needs a decision this task did not authorize: which pass owns the per-Engineer component read when the two passes disagree, and what a per-Engineer read means for an Engineer that only exists in `after`. Raised for the parent agent rather than resolved here.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
