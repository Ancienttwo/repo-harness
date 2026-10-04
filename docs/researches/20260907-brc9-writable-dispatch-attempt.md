# BRC9 writable dispatch and attempt producer

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

This package joins campaign acquisition to the existing standalone contract worker. BRC9 remains pending: adoption terminal sequencing, acquisition charging and repair/transient policy are separate packages. BRC10 readiness does not authorize a reclaim implementation.

## Authority and process boundary

`campaign-acquisition.ts` returns `worker_handoff` after real acquisition. Its selector contains `repo_root`, `campaign_id`, `group_number`, `intent_sha256` and `dispatch_id`. `campaign-worker.ts` stores the acquired EngineerOffer, WorkEnvelope, ClaimActorReceipt, parent host/session and projected contract byte digest in the existing immutable campaign planning record store. The selector locates authority; it grants none.

The local parent saves that selector and invokes the installed `contract-run run --campaign-handoff <selector-json-file>` with explicit worker/verifier commands and the exact acquired worktree and contract. The controller does not spawn a worker itself. The helper rechecks active campaign authority, stored parent identity, current Engineer principal/Binding, live ClaimActorReceipt, canonical WorkEnvelope and projected contract before each child and completion.

Dispatch identity is `canonicalMessageDigest({ operation: 'campaign-worker', intent, claim, generation })`. The immutable launch binds that dispatch to projected contract bytes and both commands. It precedes budget reservation, existing TaskAutomationAttempt start and the actual bounded child process. Worker and verifier each reserve an invocation through the existing campaign budget. The attempt uses the exact acquired Task/WorkPackage/Claim/Lease identities; its controller run and budget revision are the existing budget digests with the attempt protocol's `sha256:` prefix.

## Result and recovery

The worker receives `CONTRACT_RUN_ATTEMPT_RESULT` and `CONTRACT_RUN_DISPATCH_ID`. It writes exact JSON with `outcome` from the existing closed attempt vocabulary (excluding `started`) and nonempty `evidence_paths`. Paths must resolve to contained regular files. Successful worker and verifier processes are necessary, but their exit codes do not select a semantic outcome. This artifact is an execution report, never an AcceptanceReceipt or canonical task completion.

The host persists command/exit/output digest evidence before settling each invocation. Timeout or unknown exit retains the unresolved reservation. Missing result, failed verification or lost live authority cannot complete the attempt. An ambiguous persisted launch refuses automatic replay; this package adds no retry or reconciliation operator.

Final evidence binds result bytes, evidence file digests, both immutable process observations and the actual contract-run status/failure class before the existing attempt outcome transaction. Replay preserves that status: a missing required Review File remains a failed run even when the worker reports completed execution. If that downstream transaction is interrupted, exact replay completes it without another child. A changed command or projected contract cannot reuse the launch. Replay still requires current live authority; historical recovery after Lease loss/reclaim remains outside this package.

Records use the existing campaign group store with keys `canonicalMessageDigest({ dispatch, part }).slice(7)`, where part is `handoff`, `launch`, `child-worker`, `child-verifier` or `final`. The final `runtime_effect_id` hashes the actual request and recorded process evidence. It is not an AgentRuntimeEffectV2 launch operation and no new V2 operation is claimed. Future consumers must use this producer's actual interface and validate its ownership/time boundary rather than infer effects from prompt text.

## Limits and verification

There is one budget and one attempt authority. Existing unresolved-reservation serialization may refuse concurrent workers; maximum parallel capacity remains an upper bound. At higher concurrency this serialization is the first throughput limit. No new dependency, daemon, automatic merge, Lease renewal, native hook authority, OS path confinement or semantic acceptance is introduced.

The new owning effect protects the cross-module acquisition-to-child invariant for acquisition and contract-run. The shared test fixture reuses the existing real acquisition authority setup. Named worker tests exercise actual process writes, source/package-helper replay, stale Lease, forged selector, changed contract, unknown process outcome, missing result, final-before-attempt recovery and budget refusal. Existing acquisition, contract-run and attempt-store tests cover adjacent behavior. Final acceptance is recorded separately against a frozen subject and target; this document is not an acceptance receipt.
