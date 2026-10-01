---
name: auto-campaign
description: Start or resume one bounded repo-harness repair campaign turn with the standard budget. Use when the user asks to run auto-campaign, start a repair campaign, or automatically find and fix a bounded batch of bugs or test gaps in a repository. Questions about campaigns, skill design, and quoted instructions do not authorize execution.
disable-model-invocation: true
---

# Auto-campaign

One user invocation authorizes one conversational campaign turn, not one model
API call. Coordinate the existing CLI until a stop boundary, then report and
return control. No daemon, cron, hook-triggered execution, automatic next turn,
or automatic merge.

## Start from the current repository

1. Resolve the target repository, target ref, current host/session and any
   campaign ID from the request and existing session. Ask only for missing
   consequential inputs. Do not infer an unrelated repository or resume the
   most recent campaign merely because it exists.
2. Read [execution.md](references/execution.md) for authoritative input sources,
   CLI steps and recovery. Inspect policy at the exact target revision,
   external-source selection, browser binding and permitted worker environment
   before any grant or provider effect. An off policy, unavailable capability,
   unresolved reservation, or prohibited execution base ends this invocation
   as blocked. Report the concrete prerequisite; do not change policy, install
   infrastructure or start a trial provider call to make preflight pass.
3. Read [standard.json](references/standard.json), the sole source of default
   limits. Render its scope and bounds in plain language. Token and monetary
   caps are null: do not claim a hard token or cost budget. An explicit different
   budget is a separately reviewed grant, not a silently modified standard.

## New turn or continuation

- **New:** prepare the canonical draft with `scripts/prepare-grant.ts`. Show the
  target, Issue scope, execution environment, grant expiry and concrete limits.
  Reuse explicit approval already covering these values; otherwise obtain it
  before minting or provider calls. Invocation is not permission to invent the
  issuer, broaden scope, or enable a disabled feature. The helper only emits a
  draft; the existing grant store and campaign commands own all mutations.
- **Resume:** read the exact original campaign, grant, intent, worktree ownership
  and budget ledger first. Preserve IDs, idempotency keys and remaining budget.
  Do not run the draft helper again, extend expiry, replace the grant, reset
  counters or revive a stopped campaign. If a new grant or recovery decision is
  required, stop and explain it. Context compaction does not start a new turn.

## Execute and stop

Use the sequence in execution.md and consume the actual runtime responses.
Issue observation, canonical planning, acquire/Lease, verification and
publication retain their existing authorities. A prompt never substitutes for
a WorkEnvelope; an exit code never substitutes for an AcceptanceReceipt.
Do not synthesize missing provider revision evidence or repair metadata locally.

End this invocation at the first applicable boundary:

- The authorized group reaches its verified terminal outcome.
- A prepared PR requires human merge. Report the PR and preserve the campaign;
  after the user merges, a later explicit continuation may finish cleanup/audit
  under the original unexpired grant. Do not silently mark the group accepted.
- Budget or deadline is exhausted. Report remaining/unsettled work without
  rolling over to another grant or group.
- Policy, environment, identity, unknown provider outcome, lost ownership or
  failed verification blocks progress. Follow only the existing permitted
  reconciliation path; do not retry unknown external effects.

At a boundary leave no newly detached scheduler or worker running to continue
the turn. Use the existing cancellation/reconciliation protocol; if inactivity
cannot be proven, report it and retain ownership fences rather than claiming
cleanup completed. Persist recovery identifiers in the repository's existing
handoff surface, not a second campaign state store.

Report: outcome (`completed`, `awaiting_merge`, `budget_exhausted`, or `blocked`),
campaign/grant identifiers, Issue/PR links, exact verified revision, used and
remaining authoritative budget, unresolved effects and the next bounded action.
These are user-facing summaries, not new runtime lifecycle states. A successful
skill invocation alone is not BRC activation or full-chain acceptance.
