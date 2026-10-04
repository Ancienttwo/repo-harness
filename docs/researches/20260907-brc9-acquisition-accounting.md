# BRC9 acquisition accounting

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

The campaign CLI calls `runCampaignAcquisition` directly, so the generic automation controller's acquisition accounting did not cover this runtime path. Real acquisition controls reproduced both missing successful-acquisition usage and missing reservations after an unknown effect.

`src/effects/automation/campaign-acquisition.ts` now serializes the short reservation/acquisition/result/usage transaction with the existing campaign mutation lock. Worker execution happens after release. This preserves parallel worker capacity without weakening the budget's rule against a different unresolved reservation. At higher load the serialized acquisition transaction limits admission throughput; it does not serialize live workers.

The existing group planning record store holds an immutable authenticated request/admission and actual acquisition result. These records are recovery evidence, not counters. The existing automation budget owns all arithmetic. A result is persisted before usage; replay settles interrupted usage without another acquisition. An admission with no result fails closed for reconciliation. Unknown results and failed rollback do not become no-progress proof.

The Engineer acquisition boundary must preserve the classification of Lease readback. `record: null` also occurs for an unknown or malformed owner record, so it does not by itself prove absence of the acquired Claim. After receipt failure, unknown readback returns `rollback_failed`, leaving the campaign reservation unresolved. This was verified with actual Fleet acquisition, failed receipt publication and a corrupted owner record; the next acquisition invokes no effect.

Canonical acquire-next intentionally allows a no-eligible key to try again later. Each later idle attempt therefore uses a chained admission identity. A successful key replays its original acquisition without another charge, even when the acquisition limit has subsequently been reached. Pre-budget successful acquisitions require explicit reconciliation rather than retroactive admission.

Development verification covers real success accounting, exhaustion before Claim, exact replay, result-before-usage recovery, unknown post-acquisition failure, authenticated request/live Lease validation, two-process capacity, and an idle key becoming eligible after release. Acquisition tests passed 12/12 plus the added recovery test 1/1; the shared worker consumer passed 9/9. Final acceptance is recorded in the matching 20260907-0116 task contract and review.

This package does not complete BRC9. Per-task repair accounting, transient retry policy and adoption terminal sequencing retain separate implementation and acceptance boundaries.
