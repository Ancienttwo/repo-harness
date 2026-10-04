# Engineer acquisition evidence

Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

The acquisition-cutover CLI commands are retired. Ordinary acquisition uses the protocol 2 inner receipt ledger. Known pending and completed keys resolve before observation freshness checks.

The retained inner migration functions are operator primitives. They do not dispatch tasks. Unknown or corrupt outcomes require their evidence owner. An old observation is not deletion authority.

## Error ownership

| Source | Stable error codes | Required handling |
|---|---|---|
| Inner receipt/seal/store | `engineer_acquisition_ledger_missing`, `engineer_acquisition_ledger_corrupt`, `engineer_acquisition_ledger_unsafe_path`, `engineer_acquisition_ledger_io`, `engineer_acquisition_ledger_cutover_required` | Reconcile the ledger; never mint a replacement transaction or reinterpret as a missing observation. |
| Observation policy authority | `engineer_observation_policy_missing`, `engineer_observation_policy_corrupt`, `engineer_observation_policy_unsafe_path` | Restore reviewed policy authority; no default policy and no observation-missing fallback. |
| Observation receipt | `engineer_observation_missing`, `engineer_observation_corrupt`, `engineer_observation_identity_mismatch`, `engineer_observation_expired`, `engineer_observation_future`, `engineer_observation_policy_changed`, `engineer_observation_unsafe_path` | New transactions refuse; known pending/completed keys are resolved **before** observation lookup/freshness. |

The existing MCP engineer boundary and local engineer CLI preserve these typed codes. Policy missing cannot become `engineer_observation_missing`. Tests exercise corrupt/null/digest-modified/symlink receipt and seal paths, policy missing/corrupt, and MCP mapping.

## Frozen-time admission audit

`now_ms` is the server observation time T1; it does not restore past authority. The 30-second bound is **admission-start freshness**, checked only after the key ledger determines a new transaction. It is not a retention TTL. Ledger owners retain `observation_ref`; closeout/recovery owns retention. Pending, referenced completed and unknown/corrupt metadata cannot be removed based on age.

| Current consumer | Effect of using older T1 | Admission safety and regression surface |
|---|---|---|
| `src/effects/engineers/scheduling.ts:352,360` | T1 flows to both Fleet and `observeRetryEligibility`. | Binding/profile/attempt/claim/concurrency authority is read now; only observation comparisons use T1. |
| `src/core/engineers/automation-attempt.ts:69-78` | Backoff may still block at T1 while T2 is eligible; first-offer `eligible_since` remains T1. | Older time is conservative at fixed current authority. Started/forbidden/exhausted/unavailable states remain blockers; attempt start independently checks `started_at` in `automation-attempt-store.ts`. |
| `src/core/engineers/scheduling.ts:604-618,660-665` | `starvation_attention` and `blocker_owner` can differ. | Both eligible observations remain eligible. Diagnostic changes can change the offer hash; each admission still matches its complete current assertion. Existing issue-287 and ME-1A tests prove attention alone does not create blockers or change admission outcomes. |
| `src/effects/fleet/acquire.ts:220` → `src/effects/state/collect-board-inputs.ts:234` | Missing explicit reclaim classification falls back to live at old T1 and liveness_unproven after expiry. | `src/core/state/project-board.ts:384-410` attaches `lease_liveness` as diagnostics. Fleet classification reads current `lease_state`, not liveness (`acquire.ts:155-183`, `core/fleet/task-offer.ts:196-198`). Bound/unavailable/unknown leases still refuse. Fleet regression guards distinguish diagnostic liveness from lease authority and torn snapshots. |
| `src/effects/state/collect-board-inputs.ts:153` → `src/effects/state/resolve-effective-state.ts:849-872` → `src/core/state/project-effective-state.ts:240-247` | Current-status snapshot freshness crosses the 24-hour threshold. | Board consumes `progress_token`, whose inputs exclude current snapshot/time (`project-effective-state.ts:302-308`). Existing effective-state tests prove identical blockers/readiness/phase/progress across freshness change. Authority freshness is a separate safety input and is not frozen away. |
| `eligible_since` passed to controller attempt start | Retains first-eligible observation evidence. | The attempt store checks real `started_at` against current retry authority; it does not use `eligible_since` to bypass admission or grant expiry. |

Board liveness is not part of its revision composition (`collect-board-inputs.ts:261-275`); this limits diagnostic consistency, not current lease admission. The read-only effective-state path does not run the separate snapshot compatibility writer. The unchanged `acquireScheduledEngineerTask` rereads/matches offers before and inside the concurrency lock (`src/effects/engineers/scheduling-acquire.ts:124-158`) and delegates to current Fleet admission. No source authority, 13-field assertion or offer revision algorithm is changed.

This proof covers current read-only consumers and existing production boundary functions with fixture ports. It is not an end-to-end deployment migration canary or a claim that attention timing cannot change UI output. A future liveness/freshness consumer that gates admission needs a new frozen-time audit before wiring.
