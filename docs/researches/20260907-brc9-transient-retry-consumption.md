# BRC9 campaign transient retry consumption

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

The campaign grant owns `transient_retry`: `max_consecutive_failures`, `initial_backoff_ms`, and `maximum_backoff_ms`. Values are explicit positive integers; maximum backoff cannot be below initial backoff. A grant without this field remains byte-identical and inspectable, but cannot authorize a new campaign step, acquisition, dispatch or provider invocation. Operators must mint an explicit grant for new campaign execution. Existing grants and completed evidence are never rewritten or assigned a runtime default.

The existing usage ledger is the only counter authority. `transient_failure` is a typed usage outcome and retains the existing provider-failure consumption arithmetic. Ordered usage events determine the consecutive failure count and last failure time. Verified successful Task completion (including not_reproducible) and successful GPT authoring work reset the streak. A failed contract-run cannot reset it even if its result file says completed. Successful acquisition, read-only observation and no-progress bookkeeping do not reset it. Acquisition lock contention is observable idle before effects, not an executed transient attempt.

Admission computes capped exponential backoff from the durable last failure timestamp under the existing budget lock. New effects receive `campaign_retry_policy_required`, `campaign_retry_backoff`, or `campaign_retry_exhausted` as appropriate. Original arithmetic limits and unresolved-reservation gates remain independent and can stop earlier. Exact known-key replay and reconciliation do not manufacture another execution. Per-Task #287 policy still blocks user/permanent failures and enforces its own attempt count and backoff.

GitHub read failures use the adapter's typed classification: network, deadline and rate_limit become transient usage; other typed failures remain provider_failure. Unknown read or mutation results retain their reservation. Successful read leaves cannot clear the streak.

The worker's complete attempt reservation stays open until both process observations and the explicit final result are validated. The producer persists its immutable final, including the exact complete attempt reservation, before settling usage and completing the existing Task attempt. Recovery can finish those downstream transactions without invoking another child. A historical final without this explicit reservation binding requires reconciliation; the runtime does not invent missing authority or rewrite that final.

This change introduces no dependency, store, persistent counter or cleanup/dispatch loop. The policy validator and pure ledger observer protect the shared admission invariant; effects remain in the existing budget store. Ledger folding remains linear in bounded run history. BRC10 lifecycle and BRC6a exact-version readback remain separate boundaries.

## BRC9 final verification mapping

The final contract consumes the original accepted packages as baseline evidence and runs current named integration checks. An old CI, prepare or external receipt is never relabeled for this subject. The exact current subject and target belong to this package's canonical verification and AcceptanceReceipt.

| BRC9 requirement | Existing authority and current verification |
|---|---|
| Wall-clock, verified metric support and budget exhaustion | issue-282-automation-budget-core/store; campaign worker reserves both children before either starts and checks the original deadline |
| Controller steps, provider leaves and no-progress streak | campaign-step-budget-prerequisite; campaign-step; campaign-provider-execution |
| GPT authoring rounds and pre-adoption identity | campaign-authoring-budget-prerequisite; gpt-pro-issue-authoring; no invented Task/Lease identity for authoring |
| Successful acquisition and refusal before Claim effects | campaign-acquisition real process, rollback, unknown Lease and replay tests; accepted acquisition publication e258d9d1 |
| Writable dispatch and closed Task attempt outcomes | campaign-worker; issue-287-automation-attempt; existing immutable handoff and Task attempt store |
| Repair cycles, final allowed repair and exact replay | integrated repair package's complete attempt reservation, campaign-worker last-slot/exhaustion regressions and budget algebra |
| Consecutive transient failures and deterministic backoff | brc9-transient-retry-consumption; typed provider and verified worker controls; existing usage ledger only |
| User/permanent blockers | existing #287 mutation-side eligibility and scheduling policy, unchanged by campaign streak policy |
| Adoption provider accounting and terminal proof | issue-batch-adoption; issue-batch-shadow-budget; campaign-authoring-budget-prerequisite; strict shadow proof remains distinct from active continuation |
| Repository integration | type, state-boundaries, SQL, architecture, task-sync, strict workflow, project state and init dry-run |

BRC10 lifecycle/reclaim and BRC6a exact-SHA readback are separate Sprint requirements. Completion of this budget row does not claim either one, nor a real provider canary or token hard limit without provider-attested usage.

## Acquisition limit versus global stop: unresolved product contract

Under the current strict global-stop contract, consuming the final successful-acquisition allowance seals the run and blocks subsequent dispatch, including the worker for that last Claim. Raising the retry fixture's acquisition allowance from two to three only isolates repair accounting; it does not resolve this product boundary. The retry fixture releases, cleans up, waits for policy backoff, and acquires with a new real-retry key; it is not a same-key double charge.

A future explicitly authorized contract decision may distinguish acquisition-only admission refusal from global stop so already acquired work can finish while another Claim is refused. That would need one consistent classification across exhaustionRefusal, reservation-limit stop publication and unsealed_exhaustion drift detection. Deadline, no-progress, unknown outcome and reconciliation must retain global blocking. This package does not change that shared contract or invent a relationship between parallelism and acquisition allowance. Acquisition count, runner invocation count, campaign repair allowance and per-Task retry policy remain distinct dimensions.

## Recovery boundaries

Budget refusal precedes publication of the immutable worker launch inside the existing planning lock. A temporary backoff therefore leaves an unstarted dispatch retryable, while a published launch without final still requires reconciliation. Existing observed usage is the settlement authority across producer upgrades: exact reservation and result evidence must match, and an existing event is never charged again using current producer semantics. Missing settlement is completed from the immutable final; mismatched evidence and operator reconciliation do not pass as observed replay.
