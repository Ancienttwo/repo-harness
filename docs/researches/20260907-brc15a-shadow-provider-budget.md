# BRC15a shadow provider-budget prerequisite

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

This package connects shadow adoption dry-run to the existing campaign budget. It does not complete BRC15a's real GPT canary, establish connector access to an exact revision, or complete BRC9's active adoption, acquisition, repair, and retry requirements.

## Authority and ordering

Actual GPT initial/fill/edit/challenge calls retain their existing reservations. Shadow GitHub repository identity and each issue page now enter through `createCampaignProviderExecutor`; each invocation reserves before I/O and records its returned outcome before usage. A snapshot is not counted as one provider call.

`readCampaignAuthoringProgress` projects an epoch from the existing group's authoring reservation and usage digests, plus completed/held/max rounds. It owns no counter or new authoring authority. Shadow step identity binds intent, authoring epoch and prior reconciliation. A partial non-exhausted batch records no-progress and releases its step. A later authorized fill changes the epoch, allowing a new observation; replay of an unchanged epoch consumes its existing outcome without a provider call.

The active step excludes concurrent authorized authoring while shadow checks initial and final snapshots, including title/body/label source revisions. This is an explicit shadow-only ordering change: both observations precede terminal creation. It proves a point-in-time source match, not that a remote human cannot change GitHub afterward. Active adoption retains its existing post-seal refresh and remains outside this package.

The per-step shadow outcome is immutable in the existing issue-batch adoption store. It binds the step admission, authoring epoch, exact refresh receipts and observations, or the known failure. It is recovery evidence, not a second budget ledger. Historical shadow adoption artifacts without admitted observation evidence are refused rather than retroactively charged.

`sealCampaignAuthoringBudget` accepts the final step completion and performs completion plus terminal persistence under the existing run lock. The terminal includes every final provider usage event and the completion in its full-ledger hash. Sealing with an unfinished controller step is rejected. Existing exact terminal freshness is unchanged.

## Recovery boundaries

- Known read failures settle their leaf. The shadow step records no-progress only when the authoritative ledger proves there are no unresolved reservations.
- Unknown runner results retain their leaf even if the observer wraps the exception as a typed network failure. Same-step replay performs no new I/O and requires reconciliation.
- A crash after returned provider evidence but before a durable snapshot cannot reconstruct raw source content from a result digest. It remains reconciliation-required; no fallback snapshot or automatic retry is introduced.
- A durable shadow result can finish interrupted completion/terminal persistence without another provider call. If completion is already durable, terminal creation requires that exact completion to remain the latest ledger transition. Intervening activity fails closed.
- A budget revision, foreign intent/admission, altered completion evidence, or source mismatch cannot reuse the result as fresh authority.

## Verification and scope

The pre-fix regression used the real observer and a fake GitHub runner in a disposable repository: the runner saw zero open reservations where one was required. The focused tests cover call admission/counting, cap refusal before I/O, known versus unknown failures, partial/fill retry, source drift, zero-I/O replay, and a filesystem fault after durable completion but before terminal publication. Existing active adoption and campaign provider/step/authoring tests cover the shared boundaries.

No new dependency, public CLI, authorization mode, or persistent budget schema was added. The shadow helper isolates its distinct point-in-time orchestration; the only new persistent records are immutable outcomes inside the existing adoption store. At higher load the existing active-step and unresolved-reservation rules serialize execution. Real GPT quality/cost measurement and active lifecycle acceptance remain separate work.
