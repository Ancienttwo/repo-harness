# Engineer acquisition cutover and frozen observation time

S2 keeps acquisition admission unchanged and moves transaction evidence to protocol 2. Deployments must quiesce old producers and explicitly seal each campaign intent before enabling campaign acquisition. The commands below inspect/migrate existing evidence; they dispatch no task and replay no external effect. Selected production entrypoints remain outside S2.

## Operator procedure

Run the installed S2 `repo-harness` binary in the repository that owns the ledger. In a source checkout, replace `repo-harness` with `bun src/cli/index.ts`. Worktrees share their Git common-directory ledger. Local filesystem access is the operator authority; these commands are not MCP tools.

1. Stop old campaign/inner acquisition producers and prevent them from restarting. Resolve pending/unknown effects through their existing closeout/recovery owner before migration. Record the deployment identity and durable quiescence evidence. A supplied string is an operator attestation, not mechanically verified process quiescence.
2. Back up the Git common-directory `repo-harness/engineer-scheduling/v1/acquire-next` ledger and campaign planning records. Preserve original bytes, pending outcomes, legacy fences, observations and their references. Never delete evidence merely because an observation is older than 30 seconds.
3. Inspect the inner ledger and review its complete inventory:

   ```bash
   repo-harness engineer acquisition-cutover inspect --json
   ```

   Record `inventory_sha256`; pending, malformed and unsettled files require reconciliation. After review, pass the exact inspected digest and actual quiescence evidence:

   ```bash
   repo-harness engineer acquisition-cutover migrate \
     --expected-inventory-sha256 '<inspected sha256>' \
     --quiescence-evidence '<durable operator evidence reference>' --json
   ```

   The existing one-shot migration rechecks inventory under its cutover lock. Completed v1 keys become terminal v2 fences retaining exact source bytes. Interrupted conversion remains closed until reconciled; unknown effects are never fabricated as completed. Inspect output is not automatically fed to migrate.
4. For **each persisted campaign group/intent**, read its exact campaign ID, group number and `intent_sha256` from its authoring evidence. Inspect the full planning namespace:

   ```bash
   repo-harness engineer campaign-acquisition-cutover inspect \
     --campaign-id '<persisted campaign ID>' --group-number '<1..3>' \
     --intent-sha256 '<persisted intent sha256>' --json
   ```

   Review every returned record, including parent/planning records and records whose purpose is unknown. The inventory reader validates planning envelopes, not every possible payload's semantics. The migration identifies legacy acquisition admission/result pairs and rejects unresolved or orphan outcomes; it skips records without acquisition reservation shape. Therefore successful migration alone does **not** prove that every unknown payload was safe. Unknown payloads need operator provenance/reconciliation, not an assumption that they are unrelated.

   ```bash
   repo-harness engineer campaign-acquisition-cutover migrate \
     --campaign-id '<persisted campaign ID>' --group-number '<1..3>' \
     --intent-sha256 '<persisted intent sha256>' \
     --expected-inventory-sha256 '<inspected full inventory sha256>' \
     --quiescence-evidence '<durable operator evidence reference>' --json
   ```

   The CLI resolves the exact persisted intent. Migration rechecks inventory under existing campaign/planning locks and writes immutable fences/seal while preserving planning records. Repeating the same migration reads back the matching seal; another inventory fails. No force, expiry cleanup or old-effect replay option exists.
5. Read back the returned seal and listed fences, retain their inventory/quiescence references, and verify the reviewed deployment is using only v2 producers before resuming. Normal acquisition reads protocol 2 exclusively; an unsealed campaign or nonempty unsealed inner store, missing known fence, pending or contradictory evidence stops execution. The unchanged empty inner-store initializer may create its own seal. Do not downgrade a sealed store to a v1 writer.

### New campaign intents and empty inventory

Campaign auto-seal is deliberately withheld. `inspectCampaignAcquisitionCutover` reads the **full shared planning inventory** (`src/effects/automation/campaign-planning-store.ts`, `listPlanningRecords`). Before `runCampaignAcquisition` can run, planning has already persisted the parent and step records (`src/effects/automation/campaign-planning.ts`, `runCampaignPlanningStep`). Thus the first acquisition normally has a nonempty inventory even for a new intent.

Filtering that inventory for acquisition-shaped records would silently classify unknown records as absent. Locks serialize writes but do not prove that retired v1 producers cannot resume. Persisting an intent is immutable/idempotent (`src/effects/automation/issue-batch-store.ts`, `persistIssueBatchIntent`); it supplies no fresh-birth certificate to seal from. A genuinely empty inventory can be explicitly inspected/sealed by the operator after old-producer retirement, using the same commands and digest review.

**Release prerequisite:** seal each new campaign intent after its planning writes are quiesced and before its acquisition step. An unsealed intent fails closed. This manual step remains operationally required; S2 adds no automatic campaign lifecycle orchestration. The inner ledger's existing new-empty-store initialization is unchanged and is not evidence that campaign inventory is empty or old campaign writers are retired.

### Removal trigger for the v1 parser

Remove the operator-only v1 decoder, migration exports and CLI migration commands in a separate reviewed change once: all supported deployments have retired v1 producers; the inner store and every retained campaign intent have verified v2 seals/fences; all pending, corrupt, unknown and orphan inventory has been reconciled by its evidence owner; and the declared operator upgrade window has ended. Deployment inventory/readback is required; one successful new campaign is insufficient. Keep v2 seal/fence validation and legacy-key refusal after removal. Neither normal acquisition nor replay invokes the v1 parser now.

## Error ownership

| Source | Stable error codes | Required handling |
|---|---|---|
| Inner receipt/seal/store | `engineer_acquisition_ledger_missing`, `engineer_acquisition_ledger_corrupt`, `engineer_acquisition_ledger_unsafe_path`, `engineer_acquisition_ledger_io` | Reconcile the ledger; never mint a replacement transaction or reinterpret as a missing observation. |
| Observation policy authority | `engineer_observation_policy_missing`, `engineer_observation_policy_corrupt`, `engineer_observation_policy_unsafe_path` | Restore reviewed policy authority; no default policy and no observation-missing fallback. |
| Observation receipt | `engineer_observation_missing`, `engineer_observation_corrupt`, `engineer_observation_identity_mismatch`, `engineer_observation_expired`, `engineer_observation_future`, `engineer_observation_policy_changed`, `engineer_observation_unsafe_path` | New transactions refuse; known pending/completed keys are resolved **before** observation lookup/freshness. |

The existing MCP engineer boundary and local engineer CLI preserve these typed codes. Campaign planning faults retain `CampaignPlanningError` ownership. Policy missing cannot become `engineer_observation_missing`. Tests exercise corrupt/null/digest-modified/symlink receipt and seal paths, policy missing/corrupt, and MCP mapping.

## Frozen-time admission audit

`now_ms` is the server observation time T1; it does not restore past authority. The 30-second bound is **admission-start freshness**, checked only after the key ledger determines a new transaction. It is not a retention TTL. Ledger owners retain `observation_ref`; closeout/recovery owns retention. Pending, referenced completed and unknown/corrupt metadata cannot be removed based on age.

| Current consumer | Effect of using older T1 | Admission safety and regression surface |
|---|---|---|
| `src/effects/engineers/scheduling.ts:352,360` | T1 flows to both Fleet and `observeRetryEligibility`. | Binding/profile/attempt/claim/concurrency authority is read now; only observation comparisons use T1. |
| `src/core/engineers/automation-attempt.ts:69-78` | Backoff may still block at T1 while T2 is eligible; first-offer `eligible_since` remains T1. | Older time is conservative at fixed current authority. Started/forbidden/exhausted/unavailable states remain blockers; attempt start independently checks `started_at` in `automation-attempt-store.ts`. |
| `src/core/engineers/scheduling.ts:604-618,660-665` | `starvation_attention` and `blocker_owner` can differ. | Both eligible observations remain eligible. Diagnostic changes can change the offer hash; each admission still matches its complete current assertion. Existing issue-287 and ME-1A tests prove attention alone does not create blockers or change admission outcomes. |
| `src/effects/fleet/acquire.ts:220` → `src/effects/state/collect-board-inputs.ts:234` | Missing explicit reclaim classification falls back to live at old T1 and liveness_unproven after expiry. | `src/core/state/project-board.ts:384-410` attaches `lease_liveness` as diagnostics. Fleet classification reads current `lease_state`, not liveness (`acquire.ts:155-183`, `core/fleet/task-offer.ts:196-198`). Bound/unavailable/unknown leases still refuse. Fleet regression guards distinguish diagnostic liveness from lease authority and torn snapshots. |
| `src/effects/state/collect-board-inputs.ts:153` → `src/effects/state/resolve-effective-state.ts:849-872` → `src/core/state/project-effective-state.ts:240-247` | Current-status snapshot freshness crosses the 24-hour threshold. | Board consumes `progress_token`, whose inputs exclude current snapshot/time (`project-effective-state.ts:302-308`). Existing effective-state tests prove identical blockers/readiness/phase/progress across freshness change. Authority freshness is a separate safety input and is not frozen away. |
| `eligible_since` passed to controller/campaign attempt start | Retains first-eligible observation evidence. | The attempt store checks real `started_at` against current retry authority; it does not use `eligible_since` to bypass admission or grant expiry. |

Board liveness is not part of its revision composition (`collect-board-inputs.ts:261-275`); this limits diagnostic consistency, not current lease admission. The read-only effective-state path does not run the separate snapshot compatibility writer. The unchanged `acquireScheduledEngineerTask` rereads/matches offers before and inside the concurrency lock (`src/effects/engineers/scheduling-acquire.ts:124-158`) and delegates to current Fleet admission. No source authority, 13-field assertion or offer revision algorithm is changed.

This proof covers current read-only consumers and existing production boundary functions with fixture ports. It is not an end-to-end deployment migration canary or a claim that attention timing cannot change UI output. A future liveness/freshness consumer that gates admission needs a new frozen-time audit before wiring.
